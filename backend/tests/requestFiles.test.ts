import http from 'node:http'
import type { AddressInfo } from 'node:net'
import request from 'supertest'
import sharp from 'sharp'
import { PDFDict, PDFDocument, PDFName, PDFRef, PDFString } from '@cantoo/pdf-lib'
import type { PDFObject } from '@cantoo/pdf-lib'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import ContactRequest from '../src/models/ContactRequest.js'
import SecurityEvent from '../src/models/SecurityEvent.js'
import { UPLOAD_LIMITS } from '../src/routes/contactRequests.js'
import { seedDemoData } from '../src/services/demoData.js'
import { oneAtATime } from '../src/services/heavyWork.js'
import { activePdfParts } from '../src/services/pdfs.js'
import { MemoryImageStore, RecordingMailer, TEST_EMAIL_SETTINGS, createTestAdmin, loggedInAgent, noBreaches, testApp, useTestDatabase } from './helpers.js'
import { HOSTILE_MARKERS, INDIRECT_MARKER, hostilePdf, indirectPdf, lockedPdf, pdfOfSize, samplePdf } from './pdfFixtures.js'

useTestDatabase()
const LIST = '/api/admin/contact-requests'
const FIELDS = { fullName: 'Ada Buyer', email: 'ada@example.com', subject: 'Electrical panels', message: 'The nameplate is in the photo.' }

// Real files made on the spot, so every check runs against genuine encoder output.
function photo(width = 400, height = 300, format: 'jpeg' | 'png' | 'webp' | 'gif' = 'jpeg') {
  return sharp({ create: { width, height, channels: 3, background: { r: 30, g: 90, b: 200 } } }).toFormat(format).toBuffer()
}
let PDF: Buffer
beforeAll(async () => { PDF = await samplePdf() })

let store: MemoryImageStore
let mailer: RecordingMailer
let app: ReturnType<typeof testApp>
beforeEach(() => {
  store = new MemoryImageStore()
  mailer = new RecordingMailer()
  app = testApp({ email: TEST_EMAIL_SETTINGS }, mailer, noBreaches, store)
})

// The form as the site sends it when files are attached: multipart, text fields plus `files`.
function send(files: [Buffer, string][], fields: Record<string, string> = FIELDS, target = app) {
  const req = request(target).post('/api/contact-requests')
  for (const [name, value] of Object.entries(fields)) req.field(name, value)
  for (const [body, filename] of files) req.attach('files', body, filename)
  return req
}

const requestFileKeys = () => [...store.objects.keys()].filter((key) => key.startsWith('request-files/'))

describe('the contact form says whether files can be attached', () => {
  it('yes when storage is set up, no when it is not', async () => {
    expect((await request(app).get('/api/contact-requests/options')).body).toEqual({ fileUploads: true })
    expect((await request(testApp()).get('/api/contact-requests/options')).body).toEqual({ fileUploads: false })
  })

  it('does not use up the form budget', async () => {
    const limited = testApp({ formRateLimit: { windowMs: 60_000, limit: 1 } })
    for (let i = 0; i < 3; i++) expect((await request(limited).get('/api/contact-requests/options')).status).toBe(200)
    expect((await request(limited).post('/api/contact-requests').send(FIELDS)).status).toBe(201)
    expect((await request(limited).post('/api/contact-requests').send(FIELDS)).status).toBe(429)
  })
})

describe('attaching files to a contact request (optional)', () => {
  it('sends the form as multipart without any files, as before', async () => {
    const res = await send([])
    expect(res.status).toBe(201)
    expect(await ContactRequest.findOne({ reference: res.body.reference }).lean()).toMatchObject({ ...FIELDS, attachments: [] })
    expect(requestFileKeys()).toEqual([])
  })

  it('re-saves photos as WebP and rebuilds PDFs, each under a random name', async () => {
    const res = await send([[await photo(3200, 2400), 'nameplate.JPG'], [PDF, 'drawing.pdf']])
    expect(res.status).toBe(201)
    expect(Object.keys(res.body).sort()).toEqual(['createdAt', 'reference'])
    const saved = await ContactRequest.findOne({ reference: res.body.reference }).lean()
    expect(saved?.attachments).toEqual([
      { id: expect.stringMatching(/^[0-9a-f]{32}$/), name: 'nameplate.webp', contentType: 'image/webp', size: expect.any(Number) },
      { id: expect.stringMatching(/^[0-9a-f]{32}$/), name: 'drawing.pdf', contentType: 'application/pdf', size: expect.any(Number) },
    ])
    const [photoFile, pdfFile] = saved?.attachments ?? []
    const storedPhoto = store.objects.get(`request-files/${photoFile.id}`)
    expect(storedPhoto?.contentType).toBe('image/webp')
    expect(await sharp(storedPhoto?.body).metadata()).toMatchObject({ format: 'webp', width: 2400, height: 1800 })
    expect(photoFile.size).toBe(storedPhoto?.body.length)
    // A new file with the same page, never the customer's own bytes (services/pdfs.ts).
    const storedPdf = Buffer.from(store.objects.get(`request-files/${pdfFile.id}`)?.body ?? [])
    expect(storedPdf.equals(PDF)).toBe(false)
    expect(pdfFile.size).toBe(storedPdf.length)
    const rebuilt = await PDFDocument.load(storedPdf)
    expect(rebuilt.getPages().map((page) => [page.getWidth(), page.getHeight()])).toEqual([[400, 300]])
  })

  it('drops camera details such as location from photos', async () => {
    const tagged = await sharp(await photo()).withExif({ IFD0: { Copyright: 'hidden-marker' } }).jpeg().toBuffer()
    const res = await send([[tagged, 'site.jpg']])
    const [file] = (await ContactRequest.findOne({ reference: res.body.reference }).lean())?.attachments ?? []
    const stored = Buffer.from(store.objects.get(`request-files/${file.id}`)?.body ?? [])
    expect((await sharp(stored).metadata()).exif).toBeUndefined()
    expect(stored.includes('hidden-marker')).toBe(false)
  })

  it('accepts PNG and WebP photos too, and keeps file names in any script', async () => {
    const res = await send([[await photo(200, 200, 'png'), 'Schaltplan Größe.png'], [await photo(200, 200, 'webp'), 'لوحة.webp']])
    expect(res.status).toBe(201)
    const saved = await ContactRequest.findOne({ reference: res.body.reference }).lean()
    expect(saved?.attachments.map((file) => file.name)).toEqual(['Schaltplan Größe.webp', 'لوحة.webp'])
  })

  it.each([
    ['a text file renamed as a photo', Buffer.from('not a photo at all'), 'nameplate.jpg'],
    ['a GIF', null, 'animation.gif'],
    ['a Word document', Buffer.from('PK\u0003\u0004word/document.xml'), 'spec.docx'],
  ])('refuses %s, naming it, and saves nothing', async (_label, body, filename) => {
    const res = await send([[await photo(), 'fine.jpg'], [body ?? await photo(100, 100, 'gif'), filename]])
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('VALIDATION_ERROR')
    expect(res.body.message).toBe(`“${filename}” could not be read as a photo or PDF. Attach JPEG, PNG, or WebP photos, or PDF documents.`)
    expect(res.body.errors.files).toBe(res.body.message)
    expect(await ContactRequest.countDocuments()).toBe(0)
    expect(requestFileKeys()).toEqual([])
  })

  it('refuses more than five files', async () => {
    const one = await photo(50, 50)
    const res = await send(Array.from({ length: 6 }, (_, i) => [one, `photo-${i}.jpg`] as [Buffer, string]))
    expect(res.status).toBe(400)
    expect(res.body).toMatchObject({ code: 'TOO_MANY_FILES', message: 'Attach up to 5 files.' })
    expect(await ContactRequest.countDocuments()).toBe(0)
  })

  it('refuses a file over 10 MB', async () => {
    const res = await send([[Buffer.concat([PDF, Buffer.alloc(10 * 1024 * 1024)]), 'huge.pdf']])
    expect(res.status).toBe(413)
    expect(res.body).toMatchObject({ code: 'FILE_TOO_LARGE', message: 'Each file must be 10 MB or smaller.' })
    expect(await ContactRequest.countDocuments()).toBe(0)
  })

  it('accepts a file of exactly 10 MB', async () => {
    const exact = await pdfOfSize(10 * 1024 * 1024)
    expect(exact.length).toBe(10 * 1024 * 1024)
    expect((await send([[exact, 'big.pdf']])).status).toBe(201)
  })

  it('refuses files sent under another field name, without a server error', async () => {
    const res = await request(app).post('/api/contact-requests').field('fullName', 'Ada').attach('upload', PDF, 'a.pdf')
    expect(res.status).toBe(400)
    expect(res.body.message).toBe('The request could not be read.')
  })

  it('refuses a cut-off upload without a server error', async () => {
    const res = await request(app).post('/api/contact-requests').set('Content-Type', 'multipart/form-data; boundary=XYZ').send('--XYZ\r\nContent-Disposition: form-data; name="files"; filename="a.pdf"\r\n\r\n%PDF-')
    expect(res.status).toBe(400)
  })

  it('checks the text fields first and stores no files when they are wrong', async () => {
    const res = await send([[await photo(), 'a.jpg']], { ...FIELDS, email: 'not-an-email' })
    expect(res.status).toBe(400)
    expect(res.body.errors.email).toBe('email must be valid.')
    expect(requestFileKeys()).toEqual([])
  })

  it('ignores an attachments list sent by the client', async () => {
    const res = await request(app).post('/api/contact-requests').send({ ...FIELDS, attachments: [{ id: 'f'.repeat(32), name: 'x.pdf', contentType: 'application/pdf', size: 1 }] })
    expect(res.status).toBe(201)
    expect((await ContactRequest.findOne({ reference: res.body.reference }).lean())?.attachments).toEqual([])
  })

  it('saves nothing for a spam-trapped request with files', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const res = await send([[await photo(), 'a.jpg']], { ...FIELDS, website: 'http://spam.example' })
    info.mockRestore()
    expect(res.status).toBe(201)
    expect(await ContactRequest.countDocuments()).toBe(0)
    expect(requestFileKeys()).toEqual([])
  })

  it('refuses files when storage is not set up, and still takes the form without them', async () => {
    const off = testApp()
    const res = await send([[PDF, 'a.pdf']], FIELDS, off)
    expect(res.status).toBe(503)
    expect(res.body.code).toBe('FILE_UPLOADS_OFF')
    expect(await ContactRequest.countDocuments()).toBe(0)
    expect((await send([], FIELDS, off)).status).toBe(201)
  })

  it('tells staff and the customer how many files came with it, without attaching them', async () => {
    const res = await send([[await photo(), 'a.jpg'], [PDF, 'b.pdf']])
    await vi.waitFor(() => expect(mailer.sent).toHaveLength(2))
    const [staff, customer] = mailer.sent
    expect(staff.text).toContain('Attached: 2 files. Open the request in the admin panel to see them.')
    expect(customer.text).toContain(`Your reference is ${res.body.reference}.\nWe received the 2 files you attached.`)
    expect(JSON.stringify(mailer.sent)).not.toContain('b.pdf')
  })

  it('says nothing about files when there are none', async () => {
    await send([])
    await vi.waitFor(() => expect(mailer.sent).toHaveLength(2))
    expect(mailer.sent.map((message) => message.text).join('\n')).not.toMatch(/attached/i)
  })
})

// Audit M-05: a PDF can carry scripts, actions, attached files, forms, and media that run when it is
// opened. GPEC has no virus scanner, so every PDF is rebuilt from its pages without them.
describe('PDFs are rebuilt without the parts that can run something', () => {
  const securityEvents = () => SecurityEvent.find({ action: 'upload.pdf' }).lean()

  async function storedPdfOf(reference: string) {
    const [file] = (await ContactRequest.findOne({ reference }).lean())?.attachments ?? []
    return Buffer.from(store.objects.get(`request-files/${file.id}`)?.body ?? [])
  }

  it('takes out scripts, actions, attached files, forms, and media, wherever they are in the file', async () => {
    const hostile = await hostilePdf()
    // The test file really holds them all.
    expect(HOSTILE_MARKERS.filter((marker) => !hostile.toString('latin1').includes(marker))).toEqual([])
    const res = await send([[hostile, 'pump layout.pdf']])
    expect(res.status).toBe(201)
    const stored = (await storedPdfOf(res.body.reference)).toString('latin1')
    expect(HOSTILE_MARKERS.filter((marker) => stored.includes(marker))).toEqual([])
  })

  it('keeps the page, its size, a web link, and a link to its own page', async () => {
    const res = await send([[await hostilePdf(), 'pump layout.pdf']])
    const rebuilt = await PDFDocument.load(await storedPdfOf(res.body.reference))
    expect(rebuilt.getPages().map((page) => [page.getWidth(), page.getHeight()])).toEqual([[400, 300]])
    const stored = (await storedPdfOf(res.body.reference)).toString('latin1')
    expect(stored).toContain('https://gpecengineering.com')
    expect(stored).toContain('/GoTo')
    // The link whose action led on to a script lost that action.
    expect(stored).not.toContain('https://example.com/next')
  })

  it('records what was taken out in the security log, with the request, but no customer details', async () => {
    const res = await send([[await hostilePdf(), 'pump layout.pdf']])
    await vi.waitFor(async () => expect(await securityEvents()).toHaveLength(1))
    const [event] = await securityEvents()
    expect(event).toMatchObject({ outcome: 'success', detail: 'scripts,actions,files,forms,media', account: null, target: { type: 'contactRequest', id: res.body.reference }, via: 'website' })
    expect(JSON.stringify(event)).not.toContain(FIELDS.email)
  })

  it('records nothing for a PDF with nothing to take out', async () => {
    expect((await send([[PDF, 'drawing.pdf']])).status).toBe(201)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(await securityEvents()).toEqual([])
  })

  it('accepts a PDF locked only against editing, and stores it unlocked', async () => {
    const res = await send([[await lockedPdf(''), 'datasheet.pdf']])
    expect(res.status).toBe(201)
    const rebuilt = await PDFDocument.load(await storedPdfOf(res.body.reference))
    expect(rebuilt.isEncrypted).toBe(false)
    expect(rebuilt.getPageCount()).toBe(1)
  })

  it('refuses a PDF that needs a password, saying why, and records it', async () => {
    const res = await send([[await photo(), 'fine.jpg'], [await lockedPdf('secret'), 'quote.pdf']])
    expect(res.status).toBe(400)
    expect(res.body.message).toBe('“quote.pdf” needs a password to open, so GPEC cannot check it. Remove the password, or send photos of the pages instead.')
    expect(res.body.errors.files).toBe(res.body.message)
    expect(await ContactRequest.countDocuments()).toBe(0)
    expect(requestFileKeys()).toEqual([])
    await vi.waitFor(async () => expect(await securityEvents()).toEqual([expect.objectContaining({ outcome: 'failure', reason: 'PDF_PASSWORD', target: null })]))
  })

  it.each([
    ['a file that only starts and ends like a PDF', Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n')],
    ['a file that only starts like a PDF', Buffer.from('%PDF-1.4 and then nothing else')],
  ])('refuses %s, naming it, and records it', async (_label, body) => {
    const res = await send([[body, 'drawing.pdf']])
    expect(res.status).toBe(400)
    expect(res.body.message).toBe('“drawing.pdf” could not be read as a PDF. Attach JPEG, PNG, or WebP photos, or PDF documents.')
    expect(await ContactRequest.countDocuments()).toBe(0)
    await vi.waitFor(async () => expect(await securityEvents()).toEqual([expect.objectContaining({ outcome: 'failure', reason: 'NOT_A_PDF' })]))
  })

  it('refuses a PDF with no pages', async () => {
    const doc = await PDFDocument.create()
    const empty = Buffer.from(await doc.save({ addDefaultPage: false }))
    const res = await send([[empty, 'empty.pdf']])
    expect(res.status).toBe(400)
    expect(res.body.message).toBe('“empty.pdf” could not be read as a PDF. Attach JPEG, PNG, or WebP photos, or PDF documents.')
  })

  // Audit S2-M04: a label stored elsewhere in the file, behind a reference, is read as a reader reads it.
  describe('with labels stored elsewhere in the file', () => {
    // Each link on the stored page: its action's type and its web address, as a reader resolves them.
    async function storedLinks(reference: string) {
      const rebuilt = await PDFDocument.load(await storedPdfOf(reference))
      const resolved = (value: PDFObject | undefined): PDFObject | undefined => value instanceof PDFRef ? resolved(rebuilt.context.lookup(value)) : value
      const text = (value: PDFObject | undefined) => {
        const found = resolved(value)
        return found instanceof PDFName || found instanceof PDFString ? found.decodeText() : null
      }
      const annotations = rebuilt.getPages()[0].node.Annots()?.asArray() ?? []
      return annotations.map((entry) => {
        const annotation = resolved(entry)
        if (!(annotation instanceof PDFDict)) throw new Error('Not an annotation.')
        const action = resolved(annotation.get(PDFName.of('A')))
        return {
          subtype: text(annotation.get(PDFName.of('Subtype'))),
          action: action instanceof PDFDict ? text(action.get(PDFName.of('S'))) : null,
          uri: action instanceof PDFDict ? text(action.get(PDFName.of('URI'))) : null,
          other: annotation.has(PDFName.of('PA')),
        }
      })
    }

    it('takes out a Launch action and an attached file, keeping the web link and the link to its page', async () => {
      const indirect = await indirectPdf()
      expect(indirect.toString('latin1')).toContain(INDIRECT_MARKER)
      const res = await send([[indirect, 'pump layout.pdf']])
      expect(res.status).toBe(201)
      const stored = (await storedPdfOf(res.body.reference)).toString('latin1')
      expect([INDIRECT_MARKER, ...HOSTILE_MARKERS].filter((marker) => stored.includes(marker))).toEqual([])
      expect(await storedLinks(res.body.reference)).toEqual([
        { subtype: 'Link', action: null, uri: null, other: false },
        { subtype: 'Link', action: null, uri: null, other: false },
        { subtype: 'Link', action: null, uri: null, other: false },
        { subtype: 'Link', action: null, uri: null, other: false },
        { subtype: 'Link', action: null, uri: null, other: false },
        { subtype: 'Link', action: 'URI', uri: 'https://gpecengineering.com/indirect', other: false },
        { subtype: 'Link', action: 'GoTo', uri: null, other: false },
      ])
    })

    it('records what was taken out in the security log', async () => {
      await send([[await indirectPdf(), 'pump layout.pdf']])
      await vi.waitFor(async () => expect(await securityEvents()).toEqual([expect.objectContaining({ outcome: 'success', detail: 'actions,files' })]))
    })
  })
})

// The last check on every rebuilt PDF (audit S2-M04): anything that can run, found after the rebuild,
// refuses the file. It reads the file the way the rebuild does, so it is tested on its own here.
describe('activePdfParts', () => {
  it('finds every part that can run, including ones stored behind references', async () => {
    expect(await activePdfParts(await hostilePdf())).toEqual(['scripts', 'actions', 'files', 'forms', 'media'])
    expect(await activePdfParts(await indirectPdf())).toEqual(['actions', 'files'])
  })

  it('finds nothing in a plain PDF or one with only safe links', async () => {
    expect(await activePdfParts(await samplePdf())).toEqual([])
    const doc = await PDFDocument.create()
    const page = doc.addPage([400, 300])
    page.node.Annots()?.push(doc.context.register(doc.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [0, 0, 10, 10], A: { S: 'URI', URI: PDFString.of('https://gpecengineering.com') } })))
    expect(await activePdfParts(Buffer.from(await doc.save()))).toEqual([])
  })
})

describe('demo contact requests', () => {
  it('come with sample files when storage is set up, stored like a customer’s', async () => {
    expect((await seedDemoData(Date.now(), store)).files).toBe(3)
    const drawing = await ContactRequest.findOne({ reference: 'GPEC-C-2026-DE000002' }).lean()
    expect(drawing?.attachments).toEqual([{ id: expect.any(String), name: 'Sample pump layout (demo).pdf', contentType: 'application/pdf', size: expect.any(Number) }])
    const pdf = Buffer.from(store.objects.get(`request-files/${drawing?.attachments[0].id}`)?.body ?? []).toString('latin1')
    expect(pdf).toContain('(Not a real drawing.)')
    // The offset after "startxref" must point at the cross-reference table, or readers report damage.
    expect(pdf.slice(Number(/startxref\n(\d+)/.exec(pdf)?.[1]), Number(/startxref\n(\d+)/.exec(pdf)?.[1]) + 4)).toBe('xref')
    const photos = await ContactRequest.findOne({ reference: 'GPEC-C-2026-DE000004' }).lean()
    expect(photos?.attachments.map((file) => [file.name, file.contentType])).toEqual([['Sample starter photo (demo).webp', 'image/webp'], ['Sample nameplate photo (demo).webp', 'image/webp']])
  })

  it('have no files without storage', async () => {
    expect((await seedDemoData(Date.now(), null)).files).toBe(0)
    expect((await ContactRequest.findOne({ reference: 'GPEC-C-2026-DE000004' }).lean())?.attachments).toEqual([])
  })
})

describe('staff opening attached files', () => {
  let agent: Awaited<ReturnType<typeof loggedInAgent>>
  beforeEach(async () => {
    await createTestAdmin()
    agent = await loggedInAgent(app)
  })

  async function requestWithFiles() {
    const res = await send([[await photo(), 'nameplate.jpg'], [PDF, 'wiring drawing.pdf']])
    const saved = await ContactRequest.findOne({ reference: res.body.reference }).lean()
    const [photoFile, pdfFile] = saved?.attachments ?? []
    return { reference: res.body.reference as string, photoFile, pdfFile }
  }

  it('lists them on the request', async () => {
    const { reference, photoFile, pdfFile } = await requestWithFiles()
    const res = await agent.get(`${LIST}/${reference}`)
    expect(res.body.item.attachments).toEqual([
      { id: photoFile.id, name: 'nameplate.webp', contentType: 'image/webp', size: photoFile.size },
      { id: pdfFile.id, name: 'wiring drawing.pdf', contentType: 'application/pdf', size: pdfFile.size },
    ])
  })

  it('shows none for a request saved before attachments existed', async () => {
    await ContactRequest.collection.insertOne({ reference: 'GPEC-C-2026-0000AB01', fullName: 'Old', company: '', email: 'old@example.com', phone: '', subject: '', message: 'Hi', status: 'new', createdAt: new Date(), updatedAt: new Date() })
    const res = await agent.get(`${LIST}/GPEC-C-2026-0000AB01`)
    expect(res.status).toBe(200)
    expect(res.body.item.attachments).toEqual([])
    expect((await agent.get(`${LIST}/GPEC-C-2026-0000AB01/files/${'a'.repeat(32)}`)).status).toBe(404)
  })

  it('serves a photo to an admin, locked down, and never to anyone else', async () => {
    const { reference, photoFile } = await requestWithFiles()
    const path = `${LIST}/${reference}/files/${photoFile.id}`
    const anonymous = await request(app).get(path)
    expect(anonymous.status).toBe(401)
    expect(anonymous.headers['content-type']).toMatch(/json/)

    const res = await agent.get(path).buffer(true).parse((response, done) => {
      const chunks: Buffer[] = []
      response.on('data', (chunk: Buffer) => chunks.push(chunk))
      response.on('end', () => done(null, Buffer.concat(chunks)))
    })
    expect(res.status).toBe(200)
    expect(res.headers).toMatchObject({
      'content-type': 'image/webp',
      'cache-control': 'no-store',
      'content-security-policy': "default-src 'none'; sandbox",
      'cross-origin-resource-policy': 'same-site',
      'x-content-type-options': 'nosniff',
    })
    expect(res.headers['content-disposition']).toBeUndefined()
    expect(Buffer.compare(res.body as Buffer, Buffer.from(store.objects.get(`request-files/${photoFile.id}`)?.body ?? []))).toBe(0)
  })

  it('always downloads a PDF, under the name the customer gave it', async () => {
    const { reference, pdfFile } = await requestWithFiles()
    const res = await agent.get(`${LIST}/${reference}/files/${pdfFile.id}`)
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toBe('application/pdf')
    expect(res.headers['content-disposition']).toBe('attachment; filename="wiring drawing.pdf"')
  })

  it('finds only files listed on that request', async () => {
    const first = await requestWithFiles()
    const second = await requestWithFiles()
    expect((await agent.get(`${LIST}/${second.reference}/files/${first.photoFile.id}`)).status).toBe(404)
    expect((await agent.get(`${LIST}/${first.reference}/files/${'0'.repeat(32)}`)).status).toBe(404)
    expect((await agent.get(`${LIST}/${first.reference}/files/..%2F..%2Fproduct-images%2Fx`)).status).toBe(404)
    expect((await agent.get(`${LIST}/GPEC-C-2026-00000000/files/${first.photoFile.id}`)).status).toBe(404)
  })

  it('answers 404, not an error, if a listed file is missing from storage', async () => {
    const { reference, photoFile } = await requestWithFiles()
    store.objects.delete(`request-files/${photoFile.id}`)
    expect((await agent.get(`${LIST}/${reference}/files/${photoFile.id}`)).status).toBe(404)
  })
})

// Audit M-04: anyone can send a form with files, and the server holds them in memory while checking
// them, so the server limits how much arrives and how many arrive at once. A form with files that
// starts arriving and stalls stands for a slow or deliberately stuck sender.
describe('limits on forms with files', () => {
  const MB = 1024 * 1024
  const BOUNDARY = 'gpec-test-boundary'
  const LIMITS = { concurrent: 3, timeoutMs: 60_000 }
  const servers: http.Server[] = []
  const uploads: http.ClientRequest[] = []
  let limited: ReturnType<typeof testApp>

  beforeEach(() => {
    // Production: behind the proxy, each sender's address comes from X-Forwarded-For.
    limited = testApp({ isProduction: true, uploadLimits: LIMITS }, null, noBreaches, store)
  })

  afterEach(async () => {
    for (const upload of uploads.splice(0)) upload.destroy()
    for (const server of servers.splice(0)) {
      server.closeAllConnections()
      await new Promise((resolve) => server.close(resolve))
    }
  })

  interface Answer { status: number, headers: http.IncomingHttpHeaders, body: { code?: string, message?: string } | null }

  // Sends the text fields and the start of a PDF, then nothing more: the upload never finishes. The
  // answer comes only if the server replies before the rest arrives.
  async function stalledUpload(target: ReturnType<typeof testApp>, sender: string, { contentLength = 5 * MB, chunked = false } = {}) {
    const server = await new Promise<http.Server>((resolve) => { const started = target.listen(0, () => resolve(started)) })
    servers.push(server)
    const headers: Record<string, string> = { 'Content-Type': `multipart/form-data; boundary=${BOUNDARY}`, 'X-Forwarded-For': sender }
    if (!chunked) headers['Content-Length'] = String(contentLength)
    const upload = http.request({ port: (server.address() as AddressInfo).port, method: 'POST', path: '/api/contact-requests', headers })
    upload.on('error', () => {})
    uploads.push(upload)
    const answer = new Promise<Answer>((resolve) => upload.on('response', (res) => {
      let text = ''
      res.on('data', (chunk) => { text += chunk })
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: text ? JSON.parse(text) : null }))
    }))
    upload.write(`--${BOUNDARY}\r\nContent-Disposition: form-data; name="fullName"\r\n\r\nAda Buyer\r\n--${BOUNDARY}\r\nContent-Disposition: form-data; name="files"; filename="big.pdf"\r\nContent-Type: application/pdf\r\n\r\n%PDF-1.4\n`)
    // Long enough for the server to take it in and hold its place.
    await new Promise((resolve) => setTimeout(resolve, 150))
    return { answer, upload }
  }

  // An answer that has already come, or null if the server is still waiting for the upload.
  function answered(answer: Promise<Answer>) {
    return Promise.race([answer, new Promise<null>((resolve) => setTimeout(() => resolve(null), 500))])
  }

  function sendFrom(sender: string, files: [Buffer, string][] = [[PDF, 'a.pdf']]) {
    const req = request(limited).post('/api/contact-requests').set('X-Forwarded-For', sender)
    for (const [name, value] of Object.entries(FIELDS)) req.field(name, value)
    for (const [body, filename] of files) req.attach('files', body, filename)
    return req
  }


  it('refuses files over 25 MB in total before they arrive', async () => {
    const { answer } = await stalledUpload(limited, '203.0.113.1', { contentLength: 26 * MB })
    const res = await answered(answer)
    expect(res).toMatchObject({ status: 413, body: { code: 'FILES_TOO_LARGE', message: 'The files together must be 25 MB or smaller.' } })
  })

  it('refuses files over 25 MB in total even when the size given leaves room for them', async () => {
    const res = await sendFrom('203.0.113.1', [[await pdfOfSize(10 * MB), 'a.pdf'], [await pdfOfSize(10 * MB), 'b.pdf'], [await pdfOfSize(5 * MB + 1), 'c.pdf']])
    expect(res.status).toBe(413)
    expect(res.body).toMatchObject({ code: 'FILES_TOO_LARGE' })
    expect(await ContactRequest.countDocuments()).toBe(0)
    expect(requestFileKeys()).toEqual([])
  })

  it('accepts files of exactly 25 MB in total', async () => {
    const res = await sendFrom('203.0.113.1', [[await pdfOfSize(10 * MB), 'a.pdf'], [await pdfOfSize(10 * MB), 'b.pdf'], [await pdfOfSize(5 * MB), 'c.pdf']])
    expect(res.status).toBe(201)
    expect(requestFileKeys()).toHaveLength(3)
  })

  it('refuses a form with files that does not say its size (browsers always do)', async () => {
    const { answer } = await stalledUpload(limited, '203.0.113.1', { chunked: true })
    expect(await answered(answer)).toMatchObject({ status: 411 })
  })

  it('refuses files at once while storage is off, rather than reading them first', async () => {
    const off = testApp({ isProduction: true, uploadLimits: LIMITS })
    const { answer } = await stalledUpload(off, '203.0.113.1')
    expect(await answered(answer)).toMatchObject({ status: 503, body: { code: 'FILE_UPLOADS_OFF' } })
  })

  it('takes one form with files at a time from each sender', async () => {
    const first = await stalledUpload(limited, '203.0.113.1')
    const again = await sendFrom('203.0.113.1')
    expect(again.status).toBe(429)
    expect(again.body).toMatchObject({ code: 'UPLOAD_IN_PROGRESS', message: 'Your earlier message with files is still being sent. Wait for it to finish, then try again.' })
    expect((await sendFrom('203.0.113.2')).status).toBe(201)
    // Once the first is over, the sender can send again.
    first.upload.destroy()
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect((await sendFrom('203.0.113.1')).status).toBe(201)
  })

  it('takes at most three forms with files at once, and says the site is busy to a fourth', async () => {
    const [first] = await Promise.all(['203.0.113.1', '203.0.113.2', '203.0.113.3'].map((sender) => stalledUpload(limited, sender)))
    const fourth = await sendFrom('203.0.113.4')
    expect(fourth.status).toBe(503)
    expect(fourth.headers['retry-after']).toBe('60')
    expect(fourth.body).toMatchObject({ code: 'UPLOADS_BUSY', message: 'Many people are sending files right now. Please try again in a minute: your message and files are still in the form.' })
    expect(await ContactRequest.countDocuments()).toBe(0)
    // Forms without files are never held up.
    expect((await request(limited).post('/api/contact-requests').set('X-Forwarded-For', '203.0.113.4').send(FIELDS)).status).toBe(201)
    // A place frees up when an upload ends, finished or not.
    first.upload.destroy()
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect((await sendFrom('203.0.113.4')).status).toBe(201)
  })

  it('frees the place of a refused form, too', async () => {
    for (let i = 0; i < 4; i++) expect((await sendFrom('203.0.113.1', [[PDF, 'notes.txt'], [Buffer.from('hello'), 'notes.txt']])).status).toBe(400)
    expect((await sendFrom('203.0.113.1')).status).toBe(201)
  })

  it('stops a form with files that takes longer than the time limit, and frees its place', async () => {
    const quick = testApp({ isProduction: true, uploadLimits: { concurrent: 1, timeoutMs: 300 } }, null, noBreaches, store)
    const { answer } = await stalledUpload(quick, '203.0.113.1')
    const res = await Promise.race([answer, new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000))])
    expect(res).toMatchObject({ status: 408, body: { code: 'UPLOAD_TOO_SLOW' } })
    const next = request(quick).post('/api/contact-requests').set('X-Forwarded-For', '203.0.113.1').field('fullName', FIELDS.fullName).field('email', FIELDS.email).field('subject', FIELDS.subject).field('message', FIELDS.message).attach('files', PDF, 'a.pdf')
    expect((await next).status).toBe(201)
  })

  it('allows five minutes by default', () => {
    expect(UPLOAD_LIMITS).toEqual({ concurrent: 3, timeoutMs: 5 * 60_000 })
  })

  // Audit S3-M02: a form's place was given back when its connection closed, while its files were still
  // being checked or stored, so more than the limit could be in memory at once.
  describe('a form stopped or abandoned while its files are handled', () => {
    // Holds the first file stored until released; later ones go straight in.
    class PausedStore extends MemoryImageStore {
      started = 0
      release = () => {}
      private readonly gate = new Promise<void>((resolve) => { this.release = resolve })
      override async put(key: string, body: Buffer, contentType: string) {
        this.started += 1
        if (this.started === 1) await this.gate
        return super.put(key, body, contentType)
      }
    }

    // The whole form, sent in full, so the server goes on to check and store its file.
    async function completeUpload(target: ReturnType<typeof testApp>, sender: string) {
      const server = await new Promise<http.Server>((resolve) => { const started = target.listen(0, () => resolve(started)) })
      servers.push(server)
      const parts = Object.entries(FIELDS).map(([name, value]) => Buffer.from(`--${BOUNDARY}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`))
      const body = Buffer.concat([...parts, Buffer.from(`--${BOUNDARY}\r\nContent-Disposition: form-data; name="files"; filename="a.pdf"\r\nContent-Type: application/pdf\r\n\r\n`), PDF, Buffer.from(`\r\n--${BOUNDARY}--\r\n`)])
      const upload = http.request({ port: (server.address() as AddressInfo).port, method: 'POST', path: '/api/contact-requests', headers: { 'Content-Type': `multipart/form-data; boundary=${BOUNDARY}`, 'Content-Length': String(body.length), 'X-Forwarded-For': sender } })
      upload.on('error', () => {})
      uploads.push(upload)
      const answer = new Promise<Answer>((resolve) => upload.on('response', (res) => {
        let text = ''
        res.on('data', (chunk) => { text += chunk })
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: text ? JSON.parse(text) : null }))
      }))
      upload.end(body)
      return { answer, upload }
    }

    function sendTo(target: ReturnType<typeof testApp>, sender: string) {
      const req = request(target).post('/api/contact-requests').set('X-Forwarded-For', sender)
      for (const [name, value] of Object.entries(FIELDS)) req.field(name, value)
      return req.attach('files', PDF, 'a.pdf')
    }

    it('keeps the place of a sender who hung up until the work ends, and saves nothing for them', async () => {
      const paused = new PausedStore()
      const one = testApp({ isProduction: true, uploadLimits: { concurrent: 1, timeoutMs: 60_000 } }, null, noBreaches, paused)
      const { upload } = await completeUpload(one, '203.0.113.1')
      await vi.waitFor(() => expect(paused.started).toBe(1))
      upload.destroy()
      await new Promise((resolve) => setTimeout(resolve, 100))
      // Its file is still being stored, so the only place is still taken.
      expect((await sendTo(one, '203.0.113.2')).body.code).toBe('UPLOADS_BUSY')
      paused.release()
      await vi.waitFor(async () => expect((await sendTo(one, '203.0.113.2')).status).toBe(201))
      expect(await ContactRequest.countDocuments()).toBe(1)
    })

    it('keeps the place of a form stopped by the time limit until its work ends, and saves nothing', async () => {
      const paused = new PausedStore()
      const quick = testApp({ isProduction: true, uploadLimits: { concurrent: 1, timeoutMs: 300 } }, null, noBreaches, paused)
      const { answer } = await completeUpload(quick, '203.0.113.1')
      const res = await Promise.race([answer, new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000))])
      expect(res).toMatchObject({ status: 408, body: { code: 'UPLOAD_TOO_SLOW' } })
      expect((await sendTo(quick, '203.0.113.2')).body.code).toBe('UPLOADS_BUSY')
      paused.release()
      await vi.waitFor(async () => expect((await sendTo(quick, '203.0.113.2')).status).toBe(201))
      expect(await ContactRequest.countDocuments()).toBe(1)
    })
  })
})

describe('photos and PDFs opened one at a time', () => {
  it('skips a job whose form was stopped or abandoned while it waited its turn', async () => {
    let releaseFirst = () => {}
    const gate = new Promise<void>((resolve) => { releaseFirst = resolve })
    const first = oneAtATime(async () => { await gate; return 'first' })
    const stopped = new AbortController()
    const ran: string[] = []
    const waiting = oneAtATime(async () => { ran.push('abandoned'); return 'abandoned' }, stopped.signal)
    const next = oneAtATime(async () => { ran.push('next'); return 'next' })
    stopped.abort()
    releaseFirst()
    expect(await first).toBe('first')
    await expect(waiting).rejects.toMatchObject({ name: 'AbortError' })
    expect(await next).toBe('next')
    expect(ran).toEqual(['next'])
  })
})
