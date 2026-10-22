import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Page, Request } from '@playwright/test'
import type { AdminProduct, AdminRequestDetail, AdminSessionInfo, CurrencyInfo, Product, ProductHistoryEntry, RequestHistoryEntry, RequestNote, RequestStatus } from '../../src/types'

// A stand-in for the GPEC API, answered inside the browser: tests need no backend or database, and
// can make the "server" fail on purpose. It follows the real API's routes and response shapes
// (backend/README.md); keep them in step when the API changes.

const now = new Date('2026-10-21T10:00:00Z').toISOString()
const NGN: CurrencyInfo = { code: 'NGN', minorUnitDigits: 2 }

export const ADMIN = { name: 'Sample Admin', email: 'admin@example.com', password: 'a long sample passphrase' }
export const ENQUIRY_REF = 'GPEC-2026-0000000A'
export const CONTACT_REF = 'GPEC-C-2026-0000000A'
// What the "server" answers for any photo upload, and the picture it serves for uploaded photos.
export const UPLOADED_IMAGE = `product-images/${'b'.repeat(64)}.webp`
const uploadedPhoto = readFileSync(join(process.cwd(), 'public/assets/product-lineup.png'))
// The server refuses this new password as known from a data breach.
export const BREACHED_PASSWORD = 'password password password'
const BREACHED_MESSAGE = 'This password has appeared in a data breach, so attackers try it early. Choose a different one.'

function sampleProduct(id: string, name: string, reference: string, image: string): Product {
  return { id, name, reference, description: `${name}: sample description for testing.`, specs: ['Spec one', 'Spec two'], image, alt: `${name} photo`, isPlaceholder: true }
}

export function sampleProducts(): Product[] {
  return [
    sampleProduct('panel-001', 'Custom control panel', 'GPEC-CP-001', '/assets/electrical-panels-product.png'),
    sampleProduct('solar-001', 'Solar power package', 'GPEC-SOL-020', '/assets/portfolio-solar-array.jpg'),
    sampleProduct('components-001', 'Industrial electrical components', 'GPEC-IEC-033', '/assets/portfolio-electrical-components-poster.jpg'),
    sampleProduct('accessories-001', 'Panel accessories', 'GPEC-PA-042', '/assets/product-lineup.png'),
    sampleProduct('metering-001', 'Power metering kit', 'GPEC-PMK-051', '/assets/control-panel-annotated-clean.png'),
    sampleProduct('isolation-001', 'Main isolator switch', 'GPEC-MIS-062', '/assets/electrical-panels-product.png'),
    sampleProduct('terminal-001', 'Terminal block set', 'GPEC-TB-074', '/assets/product-lineup.png'),
  ]
}

const customer = { fullName: 'Sample Customer', company: 'Sample Company Ltd', email: 'customer@example.com', phone: '+234 800 000 0000' }

export interface ApiState {
  // What GET /api/products returns, or 'error' to make it fail.
  products: Product[] | 'error'
  adminProducts: AdminProduct[]
  productHistory: Record<string, ProductHistoryEntry[]>
  enquiries: AdminRequestDetail[]
  contactRequests: AdminRequestDetail[]
  requestHistory: Record<string, RequestHistoryEntry[]>
  requestNotes: Record<string, RequestNote[]>
  // Makes adding a note fail.
  notesFail: boolean
  // Whether photo uploads are set up; and making an upload fail.
  imageUploads: boolean
  uploadFails: boolean
  currency: CurrencyInfo | null
  formsFail: boolean
  loggedIn: boolean
  // Every API request the site made, for tests to inspect.
  requests: { method: string, path: string, body: unknown }[]
}

function initialState(): ApiState {
  const products = sampleProducts()
  return {
    products,
    adminProducts: products.map((p, index) => ({ ...p, price: index === 0 ? 150050 : null, status: index === 1 ? 'archived' : 'active', sortOrder: (index + 1) * 10, updatedAt: now })),
    productHistory: { 'panel-001': [{ action: 'product.update', actor: { name: ADMIN.name, email: ADMIN.email }, changes: [{ field: 'price', from: 100000, to: 150050 }], createdAt: now }] },
    enquiries: [
      { reference: ENQUIRY_REF, status: 'new', createdAt: now, updatedAt: now, customer, location: 'Lagos', notes: 'First line.\nSecond line.', items: [{ productId: 'panel-001', name: 'Custom control panel', reference: 'GPEC-CP-001', quantity: 2 }] },
      { reference: 'GPEC-2026-0000000B', status: 'in_progress', createdAt: now, updatedAt: now, customer: { ...customer, fullName: 'Second Customer' }, location: '', notes: '', items: [{ productId: 'solar-001', name: 'Solar power package', reference: 'GPEC-SOL-020', quantity: 1 }] },
      { reference: 'GPEC-2026-0000000C', status: 'closed', createdAt: now, updatedAt: now, customer: { ...customer, fullName: 'Third Customer' }, location: '', notes: '', items: [{ productId: 'terminal-001', name: 'Terminal block set', reference: 'GPEC-TB-074', quantity: 5 }] },
    ],
    contactRequests: [{ reference: CONTACT_REF, status: 'new', createdAt: now, updatedAt: now, customer, subject: 'Solar energy', message: 'Please call me about a solar system.' }],
    requestHistory: {},
    requestNotes: { [ENQUIRY_REF]: [{ author: { name: ADMIN.name, email: ADMIN.email }, text: 'Called the customer.\nSending a quote today.', createdAt: now }] },
    notesFail: false,
    imageUploads: true,
    uploadFails: false,
    currency: NGN,
    formsFail: false,
    loggedIn: false,
    requests: [],
  }
}

type Reply = [number, unknown]

// A JSON body, or null for none or for a photo (binary) body.
function jsonBody(request: Request): Record<string, unknown> | null {
  try {
    return request.postDataJSON()
  } catch {
    return null
  }
}

function listRequests(allItems: AdminRequestDetail[], url: URL): Reply {
  const status = url.searchParams.get('status')
  const search = (url.searchParams.get('q') ?? '').toLowerCase()
  const items = allItems.filter((item) => [item.reference, item.customer.fullName, item.customer.company, item.customer.email].some((field) => field.toLowerCase().includes(search)))
  const counts = { new: 0, in_progress: 0, closed: 0 }
  for (const item of items) counts[item.status] += 1
  const shown = status ? items.filter((item) => item.status === status) : items
  const summary = (item: AdminRequestDetail) => ({
    reference: item.reference, status: item.status, createdAt: item.createdAt, name: item.customer.fullName, company: item.customer.company, email: item.customer.email,
    summary: item.items ? item.items.map((line) => `${line.quantity} × ${line.name}`).join(', ') : `${item.subject}: ${item.message}`,
  })
  return [200, { items: shown.map(summary), page: 1, totalPages: 1, total: shown.length, counts }]
}

function reply(state: ApiState, request: Request): Reply {
  const url = new URL(request.url())
  const path = url.pathname
  const method = request.method()
  const body = jsonBody(request) ?? {}
  const session: AdminSessionInfo = { admin: { name: ADMIN.name, email: ADMIN.email }, currency: state.currency, imageUploads: state.imageUploads }

  if (path === '/api/products') return state.products === 'error' ? [500, { message: 'Something went wrong on our side. Please try again.' }] : [200, { products: state.products }]
  if (path === '/api/contact-requests') return state.formsFail ? [400, { message: 'Check your details and try again.' }] : [201, { reference: 'GPEC-C-2026-AAAAAAAA', createdAt: now }]
  if (path === '/api/enquiries') return state.formsFail ? [400, { message: 'Check enquiry details and try again.' }] : [201, { reference: 'GPEC-2026-AAAAAAAA', createdAt: now }]

  if (path === '/api/admin/session' && method === 'POST') {
    if (body.email !== ADMIN.email || body.password !== ADMIN.password) return [401, { message: 'Email or password is incorrect.', code: 'INVALID_CREDENTIALS' }]
    state.loggedIn = true
    return [200, session]
  }
  if (path === '/api/admin/session' && method === 'DELETE') {
    state.loggedIn = false
    return [204, null]
  }
  if (!state.loggedIn) return [401, { message: 'Please log in to continue.', code: 'ADMIN_AUTH_REQUIRED' }]
  if (path === '/api/admin/session') return [200, session]
  if (path === '/api/admin/session/password') {
    if (body.newPassword === BREACHED_PASSWORD) return [400, { message: BREACHED_MESSAGE, code: 'PASSWORD_BREACHED', errors: { newPassword: BREACHED_MESSAGE } }]
    if (body.currentPassword !== ADMIN.password) return [400, { message: 'Your current password is incorrect.', code: 'WRONG_PASSWORD', errors: { currentPassword: 'Your current password is incorrect.' } }]
    return [204, null]
  }

  if (path === '/api/admin/product-images') {
    if (!state.imageUploads) return [503, { message: 'Photo uploads are not set up yet.', code: 'IMAGE_UPLOADS_OFF' }]
    if (state.uploadFails) return [400, { message: 'Choose a JPEG, PNG, or WebP photo. This file could not be read as one.', code: 'VALIDATION_ERROR', errors: { image: 'Choose a JPEG, PNG, or WebP photo.' } }]
    return [201, { image: UPLOADED_IMAGE }]
  }
  if (path === '/api/admin/products') return [200, { products: state.adminProducts, page: 1, totalPages: 1, total: state.adminProducts.length }]
  const productMatch = /^\/api\/admin\/products\/([^/]+)(\/history)?$/.exec(path)
  if (productMatch) {
    const product = state.adminProducts.find((p) => p.id === productMatch[1])
    if (!product) return [404, { message: 'Product not found.', code: 'NOT_FOUND' }]
    if (productMatch[2]) return [200, { history: state.productHistory[product.id] ?? [] }]
    if (method === 'PATCH') {
      const changes = Object.entries(body).map(([field, to]) => ({ field, from: product[field as keyof AdminProduct] ?? null, to }))
      Object.assign(product, body, { updatedAt: new Date().toISOString() })
      state.productHistory[product.id] = [{ action: 'product.update', actor: { name: ADMIN.name, email: ADMIN.email }, changes: changes as ProductHistoryEntry['changes'], createdAt: new Date().toISOString() }, ...(state.productHistory[product.id] ?? [])]
    }
    return [200, { product }]
  }

  const requestMatch = /^\/api\/admin\/(enquiries|contact-requests)(?:\/([^/]+))?(\/notes)?$/.exec(path)
  if (requestMatch) {
    const items = requestMatch[1] === 'enquiries' ? state.enquiries : state.contactRequests
    if (!requestMatch[2]) return listRequests(items, url)
    const item = items.find((candidate) => candidate.reference === requestMatch[2])
    if (!item) return [404, { message: 'Request not found.', code: 'NOT_FOUND' }]
    if (requestMatch[3]) {
      if (state.notesFail) return [500, { message: 'Something went wrong on our side. Please try again.' }]
      state.requestNotes[item.reference] = [{ author: { name: ADMIN.name, email: ADMIN.email }, text: String(body.text).trim(), createdAt: new Date().toISOString() }, ...(state.requestNotes[item.reference] ?? [])]
    } else if (method === 'PATCH' && body.status !== item.status) {
      const from = item.status
      item.status = body.status as RequestStatus
      state.requestHistory[item.reference] = [{ actor: { name: ADMIN.name, email: ADMIN.email }, changes: [{ field: 'status', from, to: item.status }], createdAt: new Date().toISOString() }, ...(state.requestHistory[item.reference] ?? [])]
    }
    return [requestMatch[3] ? 201 : 200, { item, history: state.requestHistory[item.reference] ?? [], notes: state.requestNotes[item.reference] ?? [] }]
  }
  return [404, { message: 'Route not found.' }]
}

// Answers every /api/ request on this page from the returned state, which tests can change at any time.
export async function mockApi(page: Page, overrides: Partial<ApiState> = {}): Promise<ApiState> {
  const state = { ...initialState(), ...overrides }
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const origin = (await request.headerValue('origin')) ?? '*'
    const cors = { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'Content-Type', 'access-control-allow-methods': 'GET, POST, PATCH, DELETE' }
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    const path = new URL(request.url()).pathname
    // Photo uploads are recorded by type and size rather than content.
    const isPhoto = (await request.headerValue('content-type'))?.startsWith('image/')
    state.requests.push({ method: request.method(), path, body: isPhoto ? { type: await request.headerValue('content-type'), bytes: request.postDataBuffer()?.length ?? 0 } : jsonBody(request) })
    if (request.method() === 'GET' && path.startsWith('/api/product-images/')) {
      return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'image/png', 'cross-origin-resource-policy': 'cross-origin' }, body: uploadedPhoto })
    }
    const [status, body] = reply(state, request)
    return route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: body === null ? '' : JSON.stringify(body) })
  })
  return state
}

// Logs in through the real login screen.
export async function logInAsAdmin(page: Page) {
  await page.goto('/#admin')
  await page.getByLabel('Email address').fill(ADMIN.email)
  await page.getByLabel('Password', { exact: true }).fill(ADMIN.password)
  await page.getByRole('button', { name: 'Log in' }).click()
  await page.getByRole('navigation', { name: 'Admin sections' }).waitFor()
}
