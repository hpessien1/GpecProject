import request from 'supertest'
import sharp from 'sharp'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ContactRequest from '../src/models/ContactRequest.js'
import { seedDemoData } from '../src/services/demoData.js'
import { MemoryImageStore, RecordingMailer, TEST_EMAIL_SETTINGS, createTestAdmin, loggedInAgent, noBreaches, testApp, useTestDatabase } from './helpers.js'

useTestDatabase()
const LIST = '/api/admin/contact-requests'
const FIELDS = { fullName: 'Ada Buyer', email: 'ada@example.com', subject: 'Electrical panels', message: 'The nameplate is in the photo.' }

// Real files made on the spot, so every check runs against genuine encoder output.
function photo(width = 400, height = 300, format: 'jpeg' | 'png' | 'webp' | 'gif' = 'jpeg') {
  return sharp({ create: { width, height, channels: 3, background: { r: 30, g: 90, b: 200 } } }).toFormat(format).toBuffer()
}
const PDF = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n')

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

  it('re-saves photos as WebP under a random name and keeps PDFs as sent', async () => {
    const res = await send([[await photo(3200, 2400), 'nameplate.JPG'], [PDF, 'drawing.pdf']])
    expect(res.status).toBe(201)
    expect(Object.keys(res.body).sort()).toEqual(['createdAt', 'reference'])
    const saved = await ContactRequest.findOne({ reference: res.body.reference }).lean()
    expect(saved?.attachments).toEqual([
      { id: expect.stringMatching(/^[0-9a-f]{32}$/), name: 'nameplate.webp', contentType: 'image/webp', size: expect.any(Number) },
      { id: expect.stringMatching(/^[0-9a-f]{32}$/), name: 'drawing.pdf', contentType: 'application/pdf', size: PDF.length },
    ])
    const [photoFile, pdfFile] = saved?.attachments ?? []
    const storedPhoto = store.objects.get(`request-files/${photoFile.id}`)
    expect(storedPhoto?.contentType).toBe('image/webp')
    expect(await sharp(storedPhoto?.body).metadata()).toMatchObject({ format: 'webp', width: 2400, height: 1800 })
    expect(photoFile.size).toBe(storedPhoto?.body.length)
    expect(Buffer.from(store.objects.get(`request-files/${pdfFile.id}`)?.body ?? []).equals(PDF)).toBe(true)
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
    ['a file that only starts like a PDF', Buffer.from('%PDF-1.4 and then nothing else'), 'drawing.pdf'],
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
    const exact = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(10 * 1024 * 1024 - 15), Buffer.from('\n%%EOF')])
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
      { id: pdfFile.id, name: 'wiring drawing.pdf', contentType: 'application/pdf', size: PDF.length },
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
