import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Page, Request } from '@playwright/test'
import type { AdminDeliveryArea, AdminOrderDetail, BankTransferHistoryEntry, BankTransferSettings, PaymentMethod, DeliveryAreaHistoryEntry, FulfilmentStatus, OrderHistoryEntry, OrderStage, AdminProduct, AdminRequestDetail, AdminSessionInfo, CurrencyInfo, PaymentStatus, Product, ProductHistoryEntry, RequestHistoryEntry, RequestNote, RequestStatus } from '../../src/types'

// A stand-in for the GPEC API, answered inside the browser: tests need no backend or database, and
// can make the "server" fail on purpose. It follows the real API's routes and response shapes
// (backend/README.md); keep them in step when the API changes.

const now = new Date('2026-10-21T10:00:00Z').toISOString()
const NGN: CurrencyInfo = { code: 'NGN', minorUnitDigits: 2 }

export const ADMIN = { name: 'Sample Admin', email: 'admin@example.com', password: 'a long sample passphrase' }
export const CONTACT_REF = 'GPEC-C-2026-0000000A'
export const ORDER_REF = 'GPEC-O-2026-0000000A'
// The order the sample checkout creates, and its Paystack reference.
export const NEW_ORDER_REF = 'GPEC-O-2026-0000000E'
export const PAYMENT_REF = 'abcdef0123456789abcdef01'
export const AREA_ID = '0123456789abcdef01234567'
// A bank-transfer order the customer has reported as sent, waiting for staff.
export const TRANSFER_ORDER_REF = 'GPEC-O-2026-0000000F'
// Test details only: not GPEC's account. (The site's own starting sample is SITE_SAMPLE_BANK below.)
// What the real server starts with (backend services/bankTransfer.ts, SAMPLE_BANK_DETAILS).
export const SITE_SAMPLE_BANK = { bankName: 'Sample Bank (not real)', accountName: 'SAMPLE – replace with GPEC’s account name', accountNumber: '0000000000' }
export const SAMPLE_BANK = { bankName: 'Sample Bank', accountName: 'GPEC Engineering Company Limited', accountNumber: '0123456789', instructions: 'Send proof of payment to the email in the footer.', payWithinDays: 3 }
// What the "server" answers for any photo upload, and the picture it serves for uploaded photos.
export const UPLOADED_IMAGE = `product-images/${'b'.repeat(64)}.webp`
const uploadedPhoto = readFileSync(join(process.cwd(), 'public/assets/product-lineup.png'))
// The server refuses this new password as known from a data breach.
export const BREACHED_PASSWORD = 'password password password'
// The one reset-link token the sample server accepts (43 characters, like the real ones).
export const RESET_TOKEN = 'r'.repeat(43)
export const RESET_REQUESTED_MESSAGE = 'If this email address belongs to a GPEC admin account, a link to reset the password is on its way. It works for 30 minutes. Check the spam folder if it does not arrive.'
const BREACHED_MESSAGE = 'This password has appeared in a data breach, so attackers try it early. Choose a different one.'

function sampleProduct(id: string, name: string, reference: string, image: string, price: number | null = null): Product {
  return { id, name, reference, description: `${name}: sample description for testing.`, specs: ['Spec one', 'Spec two'], image, alt: `${name} photo`, isPlaceholder: true, inStock: true, deliveryAvailable: true, price }
}

export function sampleProducts(): Product[] {
  return [
    // The only priced product (₦1,500.50), as in the admin products below.
    sampleProduct('panel-001', 'Custom control panel', 'GPEC-CP-001', '/assets/electrical-panels-product.png', 150050),
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

function sampleOrder(reference: string, fullName: string, method: 'pickup' | 'delivery', paymentStatus: AdminOrderDetail['paymentStatus'], fulfilmentStatus: FulfilmentStatus, lines: [string, string, string, number, number][], paymentMethod: PaymentMethod = 'paystack'): AdminOrderDetail {
  const items = lines.map(([productId, name, ref, unitPrice, quantity]) => ({ productId, name, reference: ref, unitPrice, quantity, lineTotal: unitPrice * quantity }))
  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0)
  const deliveryFee = method === 'delivery' ? 1500000 : 0
  const isTransfer = paymentMethod === 'bank_transfer'
  const stage: OrderStage = paymentStatus === 'pending_payment' ? (isTransfer ? 'transfer_reported' : 'awaiting_payment') : paymentStatus === 'failed' ? 'payment_failed' : fulfilmentStatus
  const paystackFee = isTransfer ? 0 : 200000
  return {
    reference, paymentReference: '6718a9c2f1e4b5a3c2d1e0f9', stage, paymentMethod, bankTransfer: isTransfer ? { ...SAMPLE_BANK, isSample: false } : null, transferReportedAt: isTransfer ? now : null, paymentStatus, fulfilmentStatus, paidAt: paymentStatus === 'paid' ? now : null, createdAt: now, updatedAt: now,
    customer: { ...customer, fullName }, fulfilmentMethod: method, deliveryAddress: method === 'delivery' ? '14 Sample Street\nLekki, Lagos' : '',
    deliveryAreaName: method === 'delivery' ? 'Lagos' : null, customerNotes: method === 'delivery' ? 'Please call before delivery.' : '',
    items, currency: NGN_INFO, subtotal, deliveryFee, paystackFee, total: subtotal + deliveryFee + paystackFee,
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
  // Checkout: whether Paystack is set up (and in test mode), and the delivery areas.
  paymentsOn: boolean
  testMode: boolean
  deliveryAreas: AdminDeliveryArea[]
  deliveryAreaHistory: Record<string, DeliveryAreaHistoryEntry[]>
  // What Paystack reports for the sample order once the customer is back, and making the start fail.
  paymentResult: PaymentStatus
  paymentStartFails: boolean
  // GPEC's bank details (the admin screen), offered at checkout while enabled.
  bankTransfer: BankTransferSettings
  bankTransferHistory: BankTransferHistoryEntry[]
  // Whether the customer has pressed "I have sent the transfer" for the sample transfer order.
  transferReported: boolean
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
    productHistory: { 'panel-001': [
      { action: 'product.sale', actor: { name: '', email: '' }, orderReference: ORDER_REF, changes: [{ field: 'stockQuantity', from: 5, to: 4 }], createdAt: now },
      { action: 'product.update', actor: { name: ADMIN.name, email: ADMIN.email }, orderReference: null, changes: [{ field: 'price', from: 100000, to: 150050 }], createdAt: now },
    ] },
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
      sampleOrder(TRANSFER_ORDER_REF, 'Fifth Customer', 'pickup', 'pending_payment', 'new', [['terminal-001', 'Terminal block set', 'GPEC-TB-074', 4500000, 1]], 'bank_transfer'),
    ],
    orderHistory: {},
    paymentsOn: true,
    testMode: true,
    deliveryAreas: [
      { id: AREA_ID, name: 'Port Harcourt', description: 'Woji, GRA, Trans-Amadi', fee: 300000, status: 'active', sortOrder: 10, updatedAt: now },
      { id: '0123456789abcdef01234568', name: 'Lagos', description: '', fee: 2500000, status: 'active', sortOrder: 20, updatedAt: now },
      { id: '0123456789abcdef01234569', name: 'Old area', description: '', fee: 100000, status: 'archived', sortOrder: 30, updatedAt: now },
    ],
    deliveryAreaHistory: {},
    paymentResult: 'paid',
    paymentStartFails: false,
    bankTransfer: { ...SAMPLE_BANK, enabled: true },
    bankTransferHistory: [],
    transferReported: false,
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
  const counts: Record<OrderStage, number> = { awaiting_payment: 0, awaiting_transfer: 0, transfer_reported: 0, payment_failed: 0, new: 0, processing: 0, ready_for_pickup: 0, out_for_delivery: 0, completed: 0, cancelled: 0 }
  for (const order of matching) counts[order.stage] += 1
  const shown = stage ? matching.filter((order) => order.stage === stage) : matching
  const summary = (order: AdminOrderDetail) => ({
    reference: order.reference, stage: order.stage, createdAt: order.createdAt, name: order.customer.fullName, company: order.customer.company, email: order.customer.email,
    summary: order.items.map((item) => `${item.quantity} × ${item.name}`).join(', '), fulfilmentMethod: order.fulfilmentMethod, paymentMethod: order.paymentMethod, total: order.total, currency: order.currency,
  })
  return [200, { items: shown.map(summary), page: 1, totalPages: 1, total: shown.length, counts }]
}

// The checkout routes (backend routes/checkout.ts). Prices come from the sample products; the fee is
// a simple stand-in, since only the real server's figure matters and the site just shows it.
// siteOrigin: the site's own address, where "Paystack" sends the customer back to.
function checkout(state: ApiState, path: string, method: string, body: Record<string, unknown>, siteOrigin: string): Reply {
  const { enabled, ...bank } = state.bankTransfer
  const methods: PaymentMethod[] = state.currency === null ? [] : [...(state.paymentsOn ? ['paystack' as const] : []), ...(enabled && state.currency.code === 'NGN' ? ['bank_transfer' as const] : [])]
  const available = methods.length > 0
  if (path === '/api/checkout') return [200, { paymentsAvailable: available, paymentMethods: methods, testMode: state.paymentsOn && state.testMode, currency: state.currency, bankTransfer: methods.includes('bank_transfer') ? { ...bank, isSample: bank.accountNumber === '0000000000' } : null, deliveryAreas: available ? state.deliveryAreas.filter((area) => area.status === 'active').map(({ id, name, description, fee }) => ({ id, name, description, fee })) : [] }]
  const isTransfer = body.paymentMethod === 'bank_transfer'
  if (!available) return [503, { message: 'Online payment is not available yet.', code: 'PAYMENT_CONFIG_ERROR' }]
  const products = state.products === 'error' ? [] : state.products
  const priced = (): Reply => {
    const items = (body.items as { productId: string, quantity: number }[]).map(({ productId, quantity }) => {
      const product = products.find((candidate) => candidate.id === productId)
      if (!product) throw new Error(`Unknown sample product ${productId}`)
      return { product, quantity }
    })
    const outOfStock = items.filter(({ product }) => !product.inStock)
    if (outOfStock.length > 0) return [409, { message: `Out of stock: ${outOfStock.map(({ product }) => product.name).join(', ')}.`, code: 'OUT_OF_STOCK', errors: {} }]
    const unpriced = items.filter(({ product }) => product.price === null)
    if (unpriced.length > 0) return [409, { message: `These products have no price yet and cannot be bought online: ${unpriced.map(({ product }) => product.name).join(', ')}. Contact GPEC to ask about them.`, code: 'PRICE_NOT_SET', errors: {} }]
    const area = body.fulfilmentMethod === 'delivery' ? state.deliveryAreas.find((candidate) => candidate.id === body.deliveryAreaId) : undefined
    const lines = items.map(({ product, quantity }) => ({ productId: product.id, name: product.name, reference: product.reference, unitPrice: product.price ?? 0, quantity, lineTotal: (product.price ?? 0) * quantity }))
    const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0)
    const deliveryFee = area?.fee ?? 0
    const paystackFee = isTransfer ? 0 : Math.min(Math.ceil((subtotal + deliveryFee) * 0.015) + 10000, 200000)
    return [200, { items: lines, deliveryAreaName: area?.name ?? null, currency: state.currency, subtotal, deliveryFee, paystackFee, total: subtotal + deliveryFee + paystackFee }]
  }
  if (path === '/api/checkout/quote') return priced()
  if (path === '/api/checkout/orders' && method === 'POST') {
    if (state.paymentStartFails) return [502, { message: 'The payment could not be started. Nothing was charged. Please try again in a moment.', code: 'PAYMENT_START_FAILED' }]
    if (!body.phone) return [400, { message: 'Check the details and try again.', code: 'VALIDATION_ERROR', errors: { phone: 'phone is required.' } }]
    if (isTransfer) return [201, { reference: NEW_ORDER_REF, paymentMethod: 'bank_transfer', paymentReference: PAYMENT_REF }]
    // "Paystack" sends the customer straight back, as after paying.
    return [201, { reference: NEW_ORDER_REF, paymentMethod: 'paystack', authorizationUrl: `${siteOrigin}/shop/payment-complete?trxref=${PAYMENT_REF}&reference=${PAYMENT_REF}` }]
  }
  const resultMatch = /^\/api\/checkout\/orders\/([0-9a-f]{24})(\/transfer-sent)?$/.exec(path)
  if (resultMatch) {
    // The last order placed decides how the sample order was paid.
    const placed = [...state.requests].reverse().find((r) => r.path === '/api/checkout/orders')?.body as { paymentMethod?: PaymentMethod } | undefined
    const transfer = placed?.paymentMethod === 'bank_transfer'
    if (resultMatch[2]) state.transferReported = true
    const items = [{ productId: 'panel-001', name: 'Custom control panel', reference: 'GPEC-CP-001', unitPrice: 150050, quantity: 2, lineTotal: 300100 }]
    const paystackFee = transfer ? 0 : 14502
    return [200, {
      reference: NEW_ORDER_REF, paymentMethod: transfer ? 'bank_transfer' : 'paystack', paymentStatus: state.paymentResult, paidAt: state.paymentResult === 'paid' ? now : null, fulfilmentMethod: 'pickup', deliveryAreaName: null, items, currency: state.currency, subtotal: 300100, deliveryFee: 0, paystackFee, total: 300100 + paystackFee,
      bankTransfer: transfer ? { ...SAMPLE_BANK, isSample: false, payBy: '2026-10-24T10:00:00.000Z', reportedAt: state.transferReported ? now : null } : null,
    }]
  }
  return [404, { message: 'Route not found.' }]
}

function reply(state: ApiState, request: Request): Reply {
  const url = new URL(request.url())
  const path = url.pathname
  const method = request.method()
  const body = jsonBody(request) ?? {}
  const session: AdminSessionInfo = { admin: { name: ADMIN.name, email: ADMIN.email }, currency: state.currency, imageUploads: state.imageUploads }

  // Like the real API: prices only while a currency is configured.
  if (path === '/api/products') return state.products === 'error' ? [500, { message: 'Something went wrong on our side. Please try again.' }] : [200, { products: state.currency ? state.products : state.products.map(({ price: _price, ...product }) => product), currency: state.currency }]
  if (path.startsWith('/api/checkout')) return checkout(state, path, method, body, new URL(request.frame().page().url()).origin)
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
      state.productHistory[product.id] = [{ action: 'product.update', actor: { name: ADMIN.name, email: ADMIN.email }, orderReference: null, changes: changes as ProductHistoryEntry['changes'], createdAt: new Date().toISOString() }, ...(state.productHistory[product.id] ?? [])]
    }
    return [200, { product }]
  }

  if (path === '/api/admin/delivery-areas') {
    if (method === 'POST') {
      const area: AdminDeliveryArea = { id: `${'a'.repeat(22)}${String(state.deliveryAreas.length).padStart(2, '0')}`, name: String(body.name), description: String(body.description ?? ''), fee: Number(body.fee), status: 'active', sortOrder: (state.deliveryAreas.length + 1) * 10, updatedAt: new Date().toISOString() }
      if (state.deliveryAreas.some((existing) => existing.name === area.name)) return [409, { message: 'Another delivery area already has this name.', code: 'DELIVERY_AREA_CONFLICT' }]
      state.deliveryAreas.push(area)
      state.deliveryAreaHistory[area.id] = [{ action: 'deliveryArea.create', actor: { name: ADMIN.name, email: ADMIN.email }, changes: [{ field: 'name', from: null, to: area.name }, { field: 'fee', from: null, to: area.fee }], createdAt: area.updatedAt }]
      return [201, { area }]
    }
    return [200, { areas: state.deliveryAreas }]
  }
  const areaMatch = /^\/api\/admin\/delivery-areas\/([^/]+)(\/history)?$/.exec(path)
  if (areaMatch) {
    const area = state.deliveryAreas.find((candidate) => candidate.id === areaMatch[1])
    if (!area) return [404, { message: 'Delivery area not found.', code: 'NOT_FOUND' }]
    if (areaMatch[2]) return [200, { history: state.deliveryAreaHistory[area.id] ?? [] }]
    if (method === 'PATCH') {
      const changes = Object.entries(body).map(([field, to]) => ({ field, from: area[field as keyof AdminDeliveryArea] ?? null, to }))
      Object.assign(area, body, { updatedAt: new Date().toISOString() })
      state.deliveryAreaHistory[area.id] = [{ action: 'deliveryArea.update', actor: { name: ADMIN.name, email: ADMIN.email }, changes: changes as DeliveryAreaHistoryEntry['changes'], createdAt: area.updatedAt }, ...(state.deliveryAreaHistory[area.id] ?? [])]
    }
    return [200, { area }]
  }
  if (path === '/api/admin/bank-transfer') {
    if (method === 'PATCH') {
      const changes = Object.entries(body).map(([field, to]) => ({ field, from: state.bankTransfer[field as keyof BankTransferSettings], to }))
      Object.assign(state.bankTransfer, body)
      state.bankTransferHistory = [{ actor: { name: ADMIN.name, email: ADMIN.email }, changes: changes as BankTransferHistoryEntry['changes'], createdAt: new Date().toISOString() }, ...state.bankTransferHistory]
    }
    return [200, { settings: state.bankTransfer, isSample: state.bankTransfer.accountNumber === '0000000000', history: state.bankTransferHistory }]
  }
  if (path === '/api/admin/orders') return listOrders(state.orders, url)
  const orderMatch = /^\/api\/admin\/orders\/([^/]+)(\/notes|\/transfer-received|\/transfer-not-received)?$/.exec(path)
  if (orderMatch) {
    const order = state.orders.find((candidate) => candidate.reference === orderMatch[1])
    if (!order) return [404, { message: 'Order not found.', code: 'NOT_FOUND' }]
    if (orderMatch[2] === '/transfer-received' || orderMatch[2] === '/transfer-not-received') {
      if (order.paymentMethod !== 'bank_transfer' || order.paymentStatus !== 'pending_payment') return [409, { message: 'This order is no longer awaiting a transfer.', code: 'TRANSFER_ALREADY_SETTLED' }]
      const to = orderMatch[2] === '/transfer-received' ? 'paid' : 'failed'
      Object.assign(order, { paymentStatus: to, stage: to === 'paid' ? 'new' : 'payment_failed', paidAt: to === 'paid' ? new Date().toISOString() : null })
      state.orderHistory[order.reference] = [{ action: 'order.payment', actor: { name: ADMIN.name, email: ADMIN.email }, changes: [{ field: 'paymentStatus', from: 'pending_payment', to }], createdAt: new Date().toISOString() }, ...(state.orderHistory[order.reference] ?? [])]
      return [200, { order, history: state.orderHistory[order.reference], notes: state.requestNotes[order.reference] ?? [] }]
    }
    if (orderMatch[2]) {
      if (state.notesFail) return [500, { message: 'Something went wrong on our side. Please try again.' }]
      state.requestNotes[order.reference] = [{ author: { name: ADMIN.name, email: ADMIN.email }, text: String(body.text).trim(), createdAt: new Date().toISOString() }, ...(state.requestNotes[order.reference] ?? [])]
    } else if (method === 'PATCH') {
      if (order.paymentStatus !== 'paid') return [409, { message: 'Only paid orders can be moved along.', code: 'ORDER_NOT_PAID' }]
      const to = body.fulfilmentStatus as FulfilmentStatus
      if (to !== order.fulfilmentStatus) {
        state.orderHistory[order.reference] = [{ action: 'order.status', actor: { name: ADMIN.name, email: ADMIN.email }, changes: [{ field: 'fulfilmentStatus', from: order.fulfilmentStatus, to }], createdAt: new Date().toISOString() }, ...(state.orderHistory[order.reference] ?? [])]
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
