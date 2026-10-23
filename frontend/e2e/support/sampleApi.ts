import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Page, Request } from '@playwright/test'
import type { AdminOrderDetail, FulfilmentStatus, OrderHistoryEntry, OrderStage, AdminProduct, AdminRequestDetail, AdminSessionInfo, CurrencyInfo, Product, ProductHistoryEntry, RequestHistoryEntry, RequestNote, RequestStatus } from '../../src/types'

// A stand-in for the GPEC API, answered inside the browser: tests need no backend or database, and
// can make the "server" fail on purpose. It follows the real API's routes and response shapes
// (backend/README.md); keep them in step when the API changes.

const now = new Date('2026-10-21T10:00:00Z').toISOString()
const NGN: CurrencyInfo = { code: 'NGN', minorUnitDigits: 2 }

export const ADMIN = { name: 'Sample Admin', email: 'admin@example.com', password: 'a long sample passphrase' }
export const CONTACT_REF = 'GPEC-C-2026-0000000A'
export const ORDER_REF = 'GPEC-O-2026-0000000A'
// What the "server" answers for any photo upload, and the picture it serves for uploaded photos.
export const UPLOADED_IMAGE = `product-images/${'b'.repeat(64)}.webp`
const uploadedPhoto = readFileSync(join(process.cwd(), 'public/assets/product-lineup.png'))
// The server refuses this new password as known from a data breach.
export const BREACHED_PASSWORD = 'password password password'
// The one reset-link token the sample server accepts (43 characters, like the real ones).
export const RESET_TOKEN = 'r'.repeat(43)
export const RESET_REQUESTED_MESSAGE = 'If this email address belongs to a GPEC admin account, a link to reset the password is on its way. It works for 30 minutes. Check the spam folder if it does not arrive.'
const BREACHED_MESSAGE = 'This password has appeared in a data breach, so attackers try it early. Choose a different one.'

function sampleProduct(id: string, name: string, reference: string, image: string): Product {
  return { id, name, reference, description: `${name}: sample description for testing.`, specs: ['Spec one', 'Spec two'], image, alt: `${name} photo`, isPlaceholder: true, inStock: true }
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
const NGN_INFO = { code: 'NGN', minorUnitDigits: 2 }

function sampleOrder(reference: string, fullName: string, method: 'pickup' | 'delivery', paymentStatus: AdminOrderDetail['paymentStatus'], fulfilmentStatus: FulfilmentStatus, lines: [string, string, string, number, number][]): AdminOrderDetail {
  const items = lines.map(([productId, name, ref, unitPrice, quantity]) => ({ productId, name, reference: ref, unitPrice, quantity, lineTotal: unitPrice * quantity }))
  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0)
  const deliveryFee = method === 'delivery' ? 1500000 : 0
  const stage: OrderStage = paymentStatus === 'pending_payment' ? 'awaiting_payment' : paymentStatus === 'failed' ? 'payment_failed' : fulfilmentStatus
  return {
    reference, paymentReference: '6718a9c2f1e4b5a3c2d1e0f9', stage, paymentStatus, fulfilmentStatus, paidAt: paymentStatus === 'paid' ? now : null, createdAt: now, updatedAt: now,
    customer: { ...customer, fullName }, fulfilmentMethod: method, deliveryAddress: method === 'delivery' ? '14 Sample Street\nLekki, Lagos' : '',
    items, currency: NGN_INFO, subtotal, deliveryFee, paystackFee: 200000, total: subtotal + deliveryFee + 200000,
  }
}

export interface ApiState {
  // What GET /api/products returns, or 'error' to make it fail.
  products: Product[] | 'error'
  adminProducts: AdminProduct[]
  productHistory: Record<string, ProductHistoryEntry[]>
  contactRequests: AdminRequestDetail[]
  requestHistory: Record<string, RequestHistoryEntry[]>
  requestNotes: Record<string, RequestNote[]>
  orders: AdminOrderDetail[]
  orderHistory: Record<string, OrderHistoryEntry[]>
  // Makes adding a note fail.
  notesFail: boolean
  // Whether photo uploads are set up; and making an upload fail.
  imageUploads: boolean
  uploadFails: boolean
  currency: CurrencyInfo | null
  // Whether email is set up, which "forgot password" needs.
  emailOn: boolean
  formsFail: boolean
  loggedIn: boolean
  // Every API request the site made, for tests to inspect.
  requests: { method: string, path: string, body: unknown }[]
}

function initialState(): ApiState {
  const products = sampleProducts()
  return {
    products,
    adminProducts: products.map(({ inStock: _inStock, ...p }, index) => ({ ...p, price: index === 0 ? 150050 : null, outOfStock: index === 2, stockQuantity: index === 3 ? 0 : null, status: index === 1 ? 'archived' : 'active', sortOrder: (index + 1) * 10, updatedAt: now })),
    productHistory: { 'panel-001': [{ action: 'product.update', actor: { name: ADMIN.name, email: ADMIN.email }, changes: [{ field: 'price', from: 100000, to: 150050 }], createdAt: now }] },
    contactRequests: [
      { reference: CONTACT_REF, status: 'new', createdAt: now, updatedAt: now, customer, subject: 'Solar energy', message: 'Please call me about a solar system.\nMornings are best.' },
      { reference: 'GPEC-C-2026-0000000B', status: 'in_progress', createdAt: now, updatedAt: now, customer: { ...customer, fullName: 'Second Customer' }, subject: 'Electrical sales', message: 'Do you stock 63A breakers?' },
      { reference: 'GPEC-C-2026-0000000C', status: 'closed', createdAt: now, updatedAt: now, customer: { ...customer, fullName: 'Third Customer' }, subject: '', message: 'Thank you for the quick reply.' },
    ],
    requestHistory: {},
    requestNotes: { [CONTACT_REF]: [{ author: { name: ADMIN.name, email: ADMIN.email }, text: 'Called the customer.\nSending a quote today.', createdAt: now }] },
    orders: [
      sampleOrder(ORDER_REF, 'Sample Customer', 'delivery', 'paid', 'new', [['panel-001', 'Custom control panel', 'GPEC-CP-001', 185000000, 1], ['terminal-001', 'Terminal block set', 'GPEC-TB-074', 4500000, 2]]),
      sampleOrder('GPEC-O-2026-0000000B', 'Second Customer', 'pickup', 'paid', 'ready_for_pickup', [['metering-001', 'Power metering kit', 'GPEC-PMK-051', 21000000, 1]]),
      sampleOrder('GPEC-O-2026-0000000C', 'Third Customer', 'delivery', 'paid', 'completed', [['solar-001', 'Solar power package', 'GPEC-SOL-020', 245000000, 1]]),
      sampleOrder('GPEC-O-2026-0000000D', 'Fourth Customer', 'pickup', 'pending_payment', 'new', [['isolation-001', 'Main isolator switch', 'GPEC-MIS-062', 3850000, 2]]),
    ],
    orderHistory: {},
    notesFail: false,
    imageUploads: true,
    uploadFails: false,
    currency: NGN,
    emailOn: true,
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
    summary: item.subject ? `${item.subject}: ${item.message}` : item.message,
  })
  return [200, { items: shown.map(summary), page: 1, totalPages: 1, total: shown.length, counts }]
}

function listOrders(allOrders: AdminOrderDetail[], url: URL): Reply {
  const stage = url.searchParams.get('stage')
  const search = (url.searchParams.get('q') ?? '').toLowerCase()
  const matching = allOrders.filter((order) => [order.reference, order.customer.fullName, order.customer.company, order.customer.email].some((field) => field.toLowerCase().includes(search)))
  const counts: Record<OrderStage, number> = { awaiting_payment: 0, payment_failed: 0, new: 0, processing: 0, ready_for_pickup: 0, out_for_delivery: 0, completed: 0, cancelled: 0 }
  for (const order of matching) counts[order.stage] += 1
  const shown = stage ? matching.filter((order) => order.stage === stage) : matching
  const summary = (order: AdminOrderDetail) => ({
    reference: order.reference, stage: order.stage, createdAt: order.createdAt, name: order.customer.fullName, company: order.customer.company, email: order.customer.email,
    summary: order.items.map((item) => `${item.quantity} × ${item.name}`).join(', '), fulfilmentMethod: order.fulfilmentMethod, total: order.total, currency: order.currency,
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

  if (path === '/api/admin/session' && method === 'POST') {
    if (body.email !== ADMIN.email || body.password !== ADMIN.password) return [401, { message: 'Email or password is incorrect.', code: 'INVALID_CREDENTIALS' }]
    state.loggedIn = true
    return [200, session]
  }
  if (path === '/api/admin/session' && method === 'DELETE') {
    state.loggedIn = false
    return [204, null]
  }
  if (path === '/api/admin/session/password-reset') {
    if (!state.emailOn) return [503, { message: 'Password reset by email is not set up yet. Ask the site administrator to reset your password.', code: 'PASSWORD_RESET_UNAVAILABLE' }]
    return [202, { message: RESET_REQUESTED_MESSAGE }]
  }
  if (path === '/api/admin/session/password-reset/confirm') {
    if (body.token !== RESET_TOKEN) return [400, { message: 'This reset link has expired or has already been used. Ask for a new one.', code: 'RESET_LINK_INVALID' }]
    if (body.newPassword === BREACHED_PASSWORD) return [400, { message: BREACHED_MESSAGE, code: 'PASSWORD_BREACHED', errors: { newPassword: BREACHED_MESSAGE } }]
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

  if (path === '/api/admin/orders') return listOrders(state.orders, url)
  const orderMatch = /^\/api\/admin\/orders\/([^/]+)(\/notes)?$/.exec(path)
  if (orderMatch) {
    const order = state.orders.find((candidate) => candidate.reference === orderMatch[1])
    if (!order) return [404, { message: 'Order not found.', code: 'NOT_FOUND' }]
    if (orderMatch[2]) {
      if (state.notesFail) return [500, { message: 'Something went wrong on our side. Please try again.' }]
      state.requestNotes[order.reference] = [{ author: { name: ADMIN.name, email: ADMIN.email }, text: String(body.text).trim(), createdAt: new Date().toISOString() }, ...(state.requestNotes[order.reference] ?? [])]
    } else if (method === 'PATCH') {
      if (order.paymentStatus !== 'paid') return [409, { message: 'Only paid orders can be moved along.', code: 'ORDER_NOT_PAID' }]
      const to = body.fulfilmentStatus as FulfilmentStatus
      if (to !== order.fulfilmentStatus) {
        state.orderHistory[order.reference] = [{ actor: { name: ADMIN.name, email: ADMIN.email }, changes: [{ field: 'fulfilmentStatus', from: order.fulfilmentStatus, to }], createdAt: new Date().toISOString() }, ...(state.orderHistory[order.reference] ?? [])]
        Object.assign(order, { fulfilmentStatus: to, stage: to })
      }
    }
    return [orderMatch[2] ? 201 : 200, { order, history: state.orderHistory[order.reference] ?? [], notes: state.requestNotes[order.reference] ?? [] }]
  }
  const requestMatch = /^\/api\/admin\/(contact-requests)(?:\/([^/]+))?(\/notes)?$/.exec(path)
  if (requestMatch) {
    const items = state.contactRequests
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
