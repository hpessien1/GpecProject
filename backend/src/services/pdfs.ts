import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFRef, PDFStream, PDFString } from '@cantoo/pdf-lib'
import type { PDFContext, PDFObject } from '@cantoo/pdf-lib'
import { oneAtATime } from './heavyWork.js'

// PDFs customers attach to contact requests (audit M-05). A PDF can carry things that run when it is
// opened: scripts, actions, attached files, forms that send data, and media. GPEC has no virus scanner
// (the server's 4 GB cannot hold ClamAV, and the AWS account's plan does not offer GuardDuty; the
// user's decision, 2026-10-28, with staff checking PDFs with their own antivirus before opening them),
// so every PDF is rebuilt instead: a new, empty PDF gets copies of the customer's pages only, which
// leaves behind everything outside the pages (actions that run on opening, document scripts, attached
// files, forms, bookmarks, hidden earlier versions), and then the copied pages lose the active parts
// they can hold. What staff download is the rebuilt copy; the customer's file is never stored.

// What was taken out, for the security log: scripts, actions (run on opening or by a click, other than
// going to a page or a web or email address), attached files, form fields, and media.
export const REMOVED_PDF_PARTS = ['scripts', 'actions', 'files', 'forms', 'media'] as const
export type RemovedPdfPart = typeof REMOVED_PDF_PARTS[number]

// not_a_pdf: not a PDF that can be read, or it has no pages. password: it needs a password to open,
// so it cannot be checked. (A PDF locked only against editing opens without one and is accepted.)
export type PdfRefusal = 'not_a_pdf' | 'password'
export type CleanedPdf = { body: Buffer, removed: RemovedPdfPart[] } | { refused: PdfRefusal }

// Actions that stay: going to a page in the same document, and links to web and email addresses.
const KEPT_ACTIONS = new Set(['GoTo', 'URI'])
const SAFE_LINK = /^(https?:|mailto:)/i
// Annotations (things placed on a page) that are taken off whole, by the part they belong to.
const REMOVED_ANNOTATIONS = new Map<string, RemovedPdfPart>([
  ['FileAttachment', 'files'], ['Widget', 'forms'],
  ['RichMedia', 'media'], ['Movie', 'media'], ['Sound', 'media'], ['Screen', 'media'], ['3D', 'media'],
])
// Keys that are taken out wherever they appear, by the part they belong to.
const REMOVED_KEYS = new Map<string, RemovedPdfPart>([
  ['JS', 'scripts'], ['JavaScript', 'scripts'],
  ['OpenAction', 'actions'], ['AA', 'actions'],
  ['EmbeddedFiles', 'files'], ['EF', 'files'],
  ['AcroForm', 'forms'], ['XFA', 'forms'],
  ['RichMediaContent', 'media'],
])
// What a removed action belongs to, by its type; any other type counts as an action.
const ACTION_PARTS = new Map<string, RemovedPdfPart>([
  ['JavaScript', 'scripts'], ['SubmitForm', 'forms'], ['ImportData', 'forms'], ['ResetForm', 'forms'],
  ['Movie', 'media'], ['Sound', 'media'], ['Rendition', 'media'], ['RichMediaExecute', 'media'],
])

const nameOf = (value: PDFObject | undefined) => value instanceof PDFName ? value.decodeText() : null

// The part an action belongs to if it must go, or null if it is kept.
function refusedAction(context: PDFContext, value: PDFObject | undefined): RemovedPdfPart | null {
  const action = value === undefined ? undefined : context.lookup(value)
  if (!(action instanceof PDFDict)) return null
  const type = nameOf(action.get(PDFName.of('S')))
  if (type === null) return null
  if (!KEPT_ACTIONS.has(type)) return ACTION_PARTS.get(type) ?? 'actions'
  // A link must be a web or email address: readers may run anything else (a "javascript:" address,
  // a file on the computer). A chain of further actions (Next) is never kept.
  if (action.has(PDFName.of('Next'))) return 'actions'
  if (type === 'URI') {
    const uri = action.get(PDFName.of('URI'))
    const text = uri instanceof PDFString || uri instanceof PDFHexString ? uri.decodeText() : ''
    if (!SAFE_LINK.test(text.trim())) return 'actions'
  }
  return null
}

// Checks one dictionary, noting what it holds that must go, and with strip, removing it.
function checkDict(context: PDFContext, dict: PDFDict, removed: Set<RemovedPdfPart>, strip: boolean) {
  for (const [key, part] of REMOVED_KEYS) {
    if (!dict.has(PDFName.of(key))) continue
    removed.add(part)
    if (strip) dict.delete(PDFName.of(key))
  }
  // A link or other click on a page (A), or a bookmark.
  const actionPart = refusedAction(context, dict.get(PDFName.of('A')))
  if (actionPart) {
    removed.add(actionPart)
    if (strip) dict.delete(PDFName.of('A'))
  }
  // An action's own chain of further actions.
  if (dict.has(PDFName.of('S')) && dict.has(PDFName.of('Next'))) {
    removed.add('actions')
    if (strip) dict.delete(PDFName.of('Next'))
  }
  const annotations = dict.get(PDFName.of('Annots'))
  const list = annotations === undefined ? undefined : context.lookup(annotations)
  if (!(list instanceof PDFArray)) return
  const kept = list.asArray().filter((entry) => {
    const annotation = context.lookup(entry)
    const part = annotation instanceof PDFDict ? REMOVED_ANNOTATIONS.get(nameOf(annotation.get(PDFName.of('Subtype'))) ?? '') : undefined
    if (part) removed.add(part)
    return !part
  })
  if (strip && kept.length !== list.size()) dict.set(PDFName.of('Annots'), context.obj(kept))
}

// Every dictionary in the document, including those nested inside others, once each.
function eachDict(context: PDFContext, visit: (dict: PDFDict) => void) {
  const seen = new Set<PDFObject>()
  const walk = (value: PDFObject) => {
    if (seen.has(value)) return
    seen.add(value)
    const dict = value instanceof PDFStream ? value.dict : value instanceof PDFDict ? value : null
    if (dict) {
      visit(dict)
      for (const [, child] of dict.entries()) walk(child)
    } else if (value instanceof PDFArray) {
      for (const child of value.asArray()) walk(child)
    }
  }
  for (const [, value] of context.enumerateIndirectObjects()) walk(value)
}

// Drops everything the document no longer reaches from its root, such as an action cut off a link,
// so it is not written out at all.
function dropUnreachable(context: PDFContext) {
  const reached = new Set<string>()
  const walk = (value: PDFObject | undefined) => {
    if (value instanceof PDFRef) {
      if (reached.has(value.tag)) return
      reached.add(value.tag)
      walk(context.lookup(value))
    } else if (value instanceof PDFStream) {
      walk(value.dict)
    } else if (value instanceof PDFDict) {
      for (const [, child] of value.entries()) walk(child)
    } else if (value instanceof PDFArray) {
      for (const child of value.asArray()) walk(child)
    }
  }
  walk(context.trailerInfo.Root)
  for (const [ref] of context.enumerateIndirectObjects()) {
    if (!reached.has(ref.tag)) context.delete(ref)
  }
}

async function rebuild(input: Buffer): Promise<CleanedPdf> {
  if (input.subarray(0, 5).toString('latin1') !== '%PDF-') return { refused: 'not_a_pdf' }
  let source: PDFDocument
  try {
    // An empty password opens a PDF locked only against editing; one that needs a real password fails.
    source = await PDFDocument.load(input, { password: '', updateMetadata: false })
  } catch (error) {
    const message = error instanceof Error ? `${error.name} ${error.message}` : ''
    return { refused: /encrypt|password/i.test(message) ? 'password' : 'not_a_pdf' }
  }
  try {
    const pageCount = source.getPageCount()
    if (pageCount === 0) return { refused: 'not_a_pdf' }
    // What the customer's file holds anywhere, including outside its pages, for the security log.
    const removed = new Set<RemovedPdfPart>()
    eachDict(source.context, (dict) => checkDict(source.context, dict, removed, false))
    const rebuilt = await PDFDocument.create({ updateMetadata: false })
    const pages = await rebuilt.copyPages(source, Array.from({ length: pageCount }, (_, index) => index))
    for (const page of pages) rebuilt.addPage(page)
    eachDict(rebuilt.context, (dict) => checkDict(rebuilt.context, dict, removed, true))
    dropUnreachable(rebuilt.context)
    const body = Buffer.from(await rebuilt.save({ useObjectStreams: false }))
    return { body, removed: REMOVED_PDF_PARTS.filter((part) => removed.has(part)) }
  } catch {
    // A file that opened but whose pages cannot be read or copied.
    return { refused: 'not_a_pdf' }
  }
}

// One at a time across the API, with photos (services/heavyWork.ts): a 10 MB PDF takes a good deal
// more memory while it is opened and copied.
export function cleanPdf(input: Buffer) {
  return oneAtATime(() => rebuild(input))
}
