import { PDFDict, PDFDocument, PDFName, PDFString } from '@cantoo/pdf-lib'
import type { PDFObject } from '@cantoo/pdf-lib'

// Real PDFs made on the spot for the contact-form tests (services/pdfs.ts rebuilds every PDF, so a
// file that only starts and ends like one is refused).

// A one-page drawing with text on it. pageSize: width and height in points.
export async function samplePdf(text = 'Pump layout', pageSize: [number, number] = [400, 300]) {
  const doc = await PDFDocument.create()
  doc.addPage(pageSize).drawText(text, { x: 40, y: 200 })
  return Buffer.from(await doc.save({ useObjectStreams: false }))
}

// A one-page PDF of exactly `size` bytes, padded with a block of data the page never uses.
export async function pdfOfSize(size: number) {
  let padding = Math.max(0, size - 2000)
  for (let attempt = 0; attempt < 5; attempt++) {
    const doc = await PDFDocument.create({ updateMetadata: false })
    doc.addPage()
    doc.context.register(doc.context.stream(new Uint8Array(padding)))
    const bytes = await doc.save({ useObjectStreams: false })
    if (bytes.length === size) return Buffer.from(bytes)
    padding += size - bytes.length
  }
  throw new Error(`Could not make a PDF of exactly ${size} bytes.`)
}

// A PDF that needs a password to open (userPassword), or one locked only against editing (empty
// userPassword: it opens without one).
export async function lockedPdf(userPassword: string) {
  const doc = await PDFDocument.create()
  doc.addPage([400, 300]).drawText('Locked drawing', { x: 40, y: 200 })
  doc.encrypt({ userPassword, ownerPassword: 'owner-password' })
  return Buffer.from(await doc.save())
}

// Markers whose presence in a stored file would mean a part survived the rebuild.
export const HOSTILE_MARKERS = ['app.alert', '/JavaScript', '/JS', '/OpenAction', '/AA', '/Launch', '/EmbeddedFiles', '/EF', '/AcroForm', '/Widget', '/FileAttachment', '/RichMedia', 'cmd.exe', 'javascript:']

// A PDF holding every kind of part that can run something when opened, next to the safe things that
// must stay: its text and page size, a web link, and a link to its own page.
export async function hostilePdf() {
  const doc = await PDFDocument.create()
  const page = doc.addPage([400, 300])
  page.drawText('Pump layout', { x: 40, y: 200 })
  const context = doc.context
  const script = (code: string) => context.register(context.obj({ Type: 'Action', S: 'JavaScript', JS: PDFString.of(code) }))
  const annotation = (fields: Record<string, PDFObject | string | number[]>) => context.register(context.obj({ Type: 'Annot', Rect: [0, 0, 10, 10], ...fields }))
  // A form with a field: AcroForm on the document, a Widget annotation on the page.
  doc.getForm().createTextField('customer.name').addToPage(page, { x: 40, y: 100 })
  // An attached program, listed in the document's names (EmbeddedFiles).
  await doc.attach(Buffer.from('MZ-fake-program'), 'tool.exe', { mimeType: 'application/octet-stream' })
  // Scripts that run on opening, by name, and when the page is shown.
  doc.catalog.set(PDFName.of('OpenAction'), script("app.alert('opened')"))
  page.node.set(PDFName.of('AA'), context.obj({ O: script("app.alert('page shown')") }))
  const annotations = page.node.Annots()
  for (const added of [
    annotation({ Subtype: 'Link', A: context.obj({ S: 'URI', URI: PDFString.of('https://gpecengineering.com') }) }),
    annotation({ Subtype: 'Link', A: context.obj({ S: 'GoTo', D: [page.ref, 'Fit'] }) }),
    annotation({ Subtype: 'Link', A: context.obj({ S: 'Launch', F: PDFString.of('cmd.exe') }) }),
    annotation({ Subtype: 'Link', A: context.obj({ S: 'URI', URI: PDFString.of('javascript:alert(1)') }) }),
    annotation({ Subtype: 'Link', A: script("app.alert('clicked')") }),
    annotation({ Subtype: 'Link', A: context.obj({ S: 'URI', URI: PDFString.of('https://example.com/next'), Next: script("app.alert('chained')") }) }),
    annotation({ Subtype: 'FileAttachment', FS: PDFString.of('tool.exe') }),
    annotation({ Subtype: 'RichMedia' }),
  ]) annotations?.push(added)
  // A script the document no longer points at (as an earlier version of a file can leave behind).
  context.register(context.stream("app.alert('hidden')"))
  await doc.save({ useObjectStreams: false })
  // Saved twice: the first save embeds the attachment, which adds the document's names.
  doc.catalog.lookupMaybe(PDFName.of('Names'), PDFDict)?.set(PDFName.of('JavaScript'), context.obj({ Names: [PDFString.of('start'), script("app.alert('by name')")] }))
  return Buffer.from(await doc.save({ useObjectStreams: false }))
}
