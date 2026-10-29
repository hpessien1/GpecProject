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

// The file name the hidden actions below point at; in a stored file it would mean one survived.
export const INDIRECT_MARKER = 'audit-marker-do-not-run.txt'

// Audit S2-M04: the same parts with their labels stored elsewhere in the file, behind references a
// reader follows, next to a web link and a link to its own page stored the same way, which must stay.
export async function indirectPdf() {
  const doc = await PDFDocument.create()
  const page = doc.addPage([400, 300])
  page.drawText('Pump layout', { x: 40, y: 200 })
  const context = doc.context
  // A value stored on its own, with a reference to it (twice: a reference to a reference).
  const elsewhere = (value: PDFObject) => context.register(value)
  const twice = (value: PDFObject) => context.register(elsewhere(value))
  const launch = (type: PDFObject) => context.obj({ S: type, F: PDFString.of(INDIRECT_MARKER) })
  const annotation = (fields: Record<string, PDFObject | string | number[]>) => context.register(context.obj({ Type: 'Annot', Rect: [0, 0, 10, 10], ...fields }))
  const annotations = page.node.Annots()
  for (const added of [
    annotation({ Subtype: 'Link', A: launch(elsewhere(PDFName.of('Launch'))) }),
    annotation({ Subtype: 'Link', A: launch(twice(PDFName.of('Launch'))) }),
    annotation({ Subtype: elsewhere(PDFName.of('FileAttachment')), FS: PDFString.of(INDIRECT_MARKER) }),
    // Labels that are not names at all: a reader may still read them, so they go.
    annotation({ Subtype: 'Link', A: launch(PDFString.of('Launch')) }),
    annotation({ Subtype: 'Link', A: launch(context.obj(['Launch'])) }),
    // An action under a key other than A.
    annotation({ Subtype: 'Link', PA: launch(PDFName.of('Launch')) }),
    annotation({ Subtype: 'Link', A: context.obj({ S: elsewhere(PDFName.of('URI')), URI: elsewhere(PDFString.of('https://gpecengineering.com/indirect')) }) }),
    annotation({ Subtype: 'Link', A: context.obj({ S: elsewhere(PDFName.of('GoTo')), D: [page.ref, 'Fit'] }) }),
  ]) annotations?.push(added)
  return Buffer.from(await doc.save({ useObjectStreams: false }))
}
