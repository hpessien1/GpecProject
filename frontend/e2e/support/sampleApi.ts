import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Page, Request } from '@playwright/test'
import type { AdminDeliveryArea, AdminOrderDetail, BankTransferHistoryEntry, BankTransferSettings, CustomerEmailHistoryEntry, ProductCategory, PaymentMethod, DeliveryAreaHistoryEntry, FulfilmentStatus, OrderHistoryEntry, OrderStage, AdminProduct, AdminRequestDetail, AdminSessionInfo, CurrencyInfo, PaymentCheckOutcome, PaymentStatus, Product, ProductHistoryEntry, RequestHistoryEntry, RequestNote, RequestStatus, SiteContentHistoryEntry, SiteContentKey, SiteContentPage, TwoFactorMethod } from '../../src/types'

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
// Files the first sample contact request came with: a photo and a PDF (sizes as shown to staff).
export const SAMPLE_ATTACHMENTS: AdminRequestDetail['attachments'] = [
  { id: 'a'.repeat(32), name: 'Starter nameplate.webp', contentType: 'image/webp', size: 245_760 },
  { id: 'c'.repeat(32), name: 'Panel layout.pdf', contentType: 'application/pdf', size: 1_258_291 },
]
const samplePdf = Buffer.from('%PDF-1.4\n%%EOF\n')
// The server refuses this new password as known from a data breach.
export const BREACHED_PASSWORD = 'password password password'
// The one reset-link token the sample server accepts (43 characters, like the real ones).
export const RESET_TOKEN = 'r'.repeat(43)
export const RESET_REQUESTED_MESSAGE = 'If this email address belongs to a GPEC admin account, a link to reset the password is on its way. It works for 30 minutes. Check the spam folder if it does not arrive.'
// Two-step login: the one code the sample server accepts (from the app or the email), and its
// recovery codes (each works once).
export const SAMPLE_CODE = '123456'
export const SAMPLE_RECOVERY_CODES = Array.from({ length: 10 }, (_, index) => `abcd${index}-efgh${index}`)
export const SAMPLE_APP_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'
const BREACHED_MESSAGE = 'This password has appeared in a data breach, so attackers try it early. Choose a different one.'

// Short sample versions of the staff-edited pages (the real starting text is in the backend's
// data/siteContentDefaults.ts), with a placeholder, a bullet list, and a line break to render.
function sampleSiteContent(): Record<SiteContentKey, SiteContentPage> {
  const page = (key: SiteContentKey, title: string, intro: string, sections: SiteContentPage['sections']): SiteContentPage => ({ key, title, intro, sections, approved: false, updatedAt: '2026-10-24T00:00:00.000Z' })
  return {
    privacy: page('privacy', 'Privacy notice', 'What this website collects and why.', [
      { heading: 'Who we are', body: 'This website is run by GPEC Engineering Company Limited ([company registration number]).' },
      { heading: 'What we collect and why', body: 'We only collect what you type into our forms.\n\n- Contact form: your name and email address.\n- Shop orders: your contact details and order.' },
    ]),
    refunds: page('refunds', 'Refunds, cancellations, and returns', 'What happens if you need to cancel or return an order.', [
      { heading: 'Cancelling an order', body: 'You can cancel a paid order before you collect it.\nContact us with your order reference.' },
      { heading: 'Faulty items', body: 'Tell us within [7] days of collection or delivery.' },
      { heading: 'How refunds are paid', body: '- Paystack: back to the card you paid with.\n- Bank transfer: to your account.' },
    ]),
    faq: page('faq', 'Frequently asked questions', 'Quick answers about buying from GPEC.', [
      { heading: 'How can I pay?', body: '- Online through Paystack.\n- By bank transfer.' },
      { heading: 'Where can I collect my order?', body: 'From the Woji address. [Collection hours, to be confirmed by GPEC.]' },
      { heading: 'Do you deliver?', body: 'Yes, to the delivery areas listed at checkout.' },
    ]),
  }
}

function sampleProduct(id: string, name: string, reference: string, image: string, category: ProductCategory | null, price: number | null = null): Product {
  return { id, name, reference, description: `${name}: sample description for testing.`, specs: ['Spec one', 'Spec two'], image, alt: `${name} photo`, category, isPlaceholder: true, inStock: true, deliveryAvailable: true, price }
}

// Three electrical products, one each of solar, industrial, and electronics, and one without a
// category (listed only under "All").
export function sampleProducts(): Product[] {
  return [
    // The only priced product (₦1,500.50), as in the admin products below.
    sampleProduct('panel-001', 'Custom control panel', 'GPEC-CP-001', '/assets/electrical-panels-product.png', 'electrical', 150050),
    sampleProduct('solar-001', 'Solar power package', 'GPEC-SOL-020', '/assets/portfolio-solar-array.jpg', 'solar'),
    sampleProduct('components-001', 'Industrial electrical components', 'GPEC-IEC-033', '/assets/portfolio-electrical-components-poster.jpg', 'industrial'),
    sampleProduct('accessories-001', 'Panel accessories', 'GPEC-PA-042', '/assets/product-lineup.png', 'electrical'),
    sampleProduct('metering-001', 'Power metering kit', 'GPEC-PMK-051', '/assets/control-panel-annotated-clean.png', 'electronics'),
    sampleProduct('isolation-001', 'Main isolator switch', 'GPEC-MIS-062', '/assets/electrical-panels-product.png', 'electrical'),
    sampleProduct('terminal-001', 'Terminal block set', 'GPEC-TB-074', '/assets/product-lineup.png', null),
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
  // What Paystack answers when staff ask about an unpaid order, and making Paystack unreachable.
  paymentCheck: PaymentCheckOutcome
  paymentCheckFails: boolean
  // GPEC's bank details (the admin screen), offered at checkout while enabled.
  bankTransfer: BankTransferSettings
  bankTransferHistory: BankTransferHistoryEntry[]
  // Where customers' replies go (the Emails screen), and its change history.
  customerReplyTo: string
  customerEmailHistory: CustomerEmailHistoryEntry[]
  // Whether the customer has pressed "I have sent the transfer" for the sample transfer order.
  transferReported: boolean
  // Makes adding a note fail.
  notesFail: boolean
  // Whether photo uploads are set up (product photos, and files on the contact form); and making an
  // upload fail.
  imageUploads: boolean
  uploadFails: boolean
  currency: CurrencyInfo | null
  // Whether email is set up, which "forgot password" needs.
  emailOn: boolean
  formsFail: boolean
  loggedIn: boolean
  // Two-step login: the admin's method (null: off), unused recovery codes, which methods the "server"
  // offers, whether the banner was closed this login, and a login waiting for its code.
  twoFactorMethod: TwoFactorMethod | null
  recoveryCodes: string[]
  twoFactorAvailable: { app: boolean, email: boolean }
  promptDismissed: boolean
  pendingLogin: boolean
  // The account's hourly limits (backend services/twoFactor.ts): no more login codes emailed, and
  // 6-digit codes paused after too many wrong ones.
  loginEmailLimitReached: boolean
  codesPaused: boolean
  // The FAQ, refunds policy, and privacy notice, their change histories, and making them fail to load.
  siteContent: Record<SiteContentKey, SiteContentPage>
  siteContentHistory: Record<SiteContentKey, SiteContentHistoryEntry[]>
  contentFails: boolean
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
      { reference: CONTACT_REF, status: 'new', createdAt: now, updatedAt: now, customer, subject: 'Solar energy', message: 'Please call me about a solar system.\nMornings are best.', attachments: SAMPLE_ATTACHMENTS },
      { reference: 'GPEC-C-2026-0000000B', status: 'in_progress', createdAt: now, updatedAt: now, customer: { ...customer, fullName: 'Second Customer' }, subject: 'Electrical sales', message: 'Do you stock 63A breakers?', attachments: [] },
      { reference: 'GPEC-C-2026-0000000C', status: 'closed', createdAt: now, updatedAt: now, customer: { ...customer, fullName: 'Third Customer' }, subject: '', message: 'Thank you for the quick reply.', attachments: [] },
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
    siteContent: sampleSiteContent(),
    siteContentHistory: { privacy: [], refunds: [], faq: [] },
    contentFails: false,
    paymentResult: 'paid',
    paymentStartFails: false,
    paymentCheck: 'paid',
    paymentCheckFails: false,
    bankTransfer: { ...SAMPLE_BANK, enabled: true },
    bankTransferHistory: [],
    // What the real server starts with (backend services/customerEmail.ts, DEFAULT_REPLY_TO).
    customerReplyTo: 'gpecengineeringcompanylimited@gmail.com',
    customerEmailHistory: [],
    transferReported: false,
    notesFail: false,
    imageUploads: true,
    uploadFails: false,
    currency: NGN,
    emailOn: true,
    formsFail: false,
    loggedIn: false,
    twoFactorMethod: null,
    recoveryCodes: [],
    twoFactorAvailable: { app: true, email: true },
    promptDismissed: false,
    pendingLogin: false,
    loginEmailLimitReached: false,
    codesPaused: false,
    requests: [],
  }
}

type Reply = [number, unknown]

// One page size for every admin list, history, and set of notes, as on the real server.
export const ADMIN_PAGE_SIZE = 10

function listPage<Item>(items: Item[], url: URL) {
  const page = Number(url.searchParams.get('page') ?? 1)
  return { items: items.slice((page - 1) * ADMIN_PAGE_SIZE, page * ADMIN_PAGE_SIZE), page, pageSize: ADMIN_PAGE_SIZE, totalPages: Math.max(1, Math.ceil(items.length / ADMIN_PAGE_SIZE)), total: items.length }
}

// One page of a history or of notes, newest first. The real cursor names the last entry shown; here
// it is simply how many entries come before the next page. Without a URL, the newest page.
function olderPage<Entry>(entries: Entry[], url: URL | null) {
  const start = Number(url?.searchParams.get('before') ?? 0)
  const next = start + ADMIN_PAGE_SIZE
  return { entries: entries.slice(start, next), cursor: next < entries.length ? String(next) : null }
}

function historyReply<Entry>(entries: Entry[], url: URL | null = null) {
  const { entries: history, cursor } = olderPage(entries, url)
  return { history, historyCursor: cursor }
}

function notesReply(entries: RequestNote[], url: URL | null = null) {
  const { entries: notes, cursor } = olderPage(entries, url)
  return { notes, notesCursor: cursor }
}

// A JSON body, or null for none or for a photo (binary) body.
// A multipart form's text fields, and each file's name, type, and size.
function multipartBody(raw: Buffer, contentType: string) {
  const boundary = /boundary=(?:"([^"]+)"|([^;]+))/.exec(contentType)
  const parts = raw.toString('latin1').split(`--${boundary?.[1] ?? boundary?.[2]}`).slice(1, -1)
  const fields: Record<string, string> = {}
  const files: { field: string, name: string, type: string, bytes: number }[] = []
  for (const part of parts) {
    const [head, ...rest] = part.replace(/^\r\n/, '').split('\r\n\r\n')
    const content = rest.join('\r\n\r\n').replace(/\r\n$/, '')
    const field = /name="([^"]*)"/.exec(head)?.[1] ?? ''
    const filename = /filename="([^"]*)"/.exec(head)?.[1]
    if (filename === undefined) fields[field] = Buffer.from(content, 'latin1').toString('utf8')
    else files.push({ field, name: Buffer.from(filename, 'latin1').toString('utf8'), type: /Content-Type: (.+)/i.exec(head)?.[1].trim() ?? '', bytes: Buffer.byteLength(content, 'latin1') })
  }
  return { fields, files }
}

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
  const { items: pageItems, ...paging } = listPage(shown, url)
  return [200, { items: pageItems.map(summary), ...paging, counts }]
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
  const { items, ...paging } = listPage(shown, url)
  return [200, { items: items.map(summary), ...paging, counts }]
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
  const session = (): AdminSessionInfo => ({ admin: { name: ADMIN.name, email: ADMIN.email }, currency: state.currency, imageUploads: state.imageUploads, twoFactor: { enabled: state.twoFactorMethod !== null, prompt: state.twoFactorMethod === null && !state.promptDismissed } })
  const twoFactorStatus = () => ({ method: state.twoFactorMethod, enabledAt: state.twoFactorMethod ? now : null, recoveryCodesLeft: state.recoveryCodes.length, available: state.twoFactorAvailable })
  // A code or recovery code sent with a request; a used recovery code is removed.
  const secondStepPasses = () => typeof body.recoveryCode === 'string'
    ? state.recoveryCodes.includes(body.recoveryCode) && (state.recoveryCodes = state.recoveryCodes.filter((code) => code !== body.recoveryCode), true)
    : body.code === SAMPLE_CODE

  // Like the real API: prices only while a currency is configured.
  if (path === '/api/products') return state.products === 'error' ? [500, { message: 'Something went wrong on our side. Please try again.' }] : [200, { products: state.currency ? state.products : state.products.map(({ price: _price, ...product }) => product), currency: state.currency }]
  if (path.startsWith('/api/checkout')) return checkout(state, path, method, body, new URL(request.frame().page().url()).origin)
  const publicContent = /^\/api\/content\/([^/]+)$/.exec(path)
  if (publicContent) {
    if (state.contentFails) return [500, { message: 'Something went wrong on our side. Please try again.' }]
    const found = state.siteContent[publicContent[1] as SiteContentKey]
    return found ? [200, found] : [404, { message: 'Page not found.', code: 'NOT_FOUND' }]
  }
  if (path === '/api/contact-requests/options') return [200, { fileUploads: state.imageUploads }]
  if (path === '/api/contact-requests') return state.formsFail ? [400, { message: 'Check your details and try again.' }] : [201, { reference: 'GPEC-C-2026-AAAAAAAA', createdAt: now }]

  if (path === '/api/admin/session' && method === 'POST') {
    if (body.email !== ADMIN.email || body.password !== ADMIN.password) return [401, { message: 'Email or password is incorrect.', code: 'INVALID_CREDENTIALS' }]
    if (state.twoFactorMethod) {
      state.pendingLogin = true
      const emailCodeSent = state.twoFactorMethod === 'email' && state.twoFactorAvailable.email && !state.loginEmailLimitReached
      return [200, { twoFactorRequired: true, method: state.twoFactorMethod, emailHint: state.twoFactorMethod === 'email' ? 'a•••@example.com' : null, emailAvailable: state.twoFactorAvailable.email, emailCodeSent }]
    }
    state.loggedIn = true
    state.promptDismissed = false
    return [200, session()]
  }
  if (path === '/api/admin/session/two-factor') {
    if (!state.pendingLogin) return [401, { message: 'Your login has timed out. Enter your email and password again.', code: 'LOGIN_EXPIRED' }]
    if (state.codesPaused && typeof body.code === 'string') return [429, { message: 'Too many wrong codes have been entered for this account in the last hour, so 6-digit codes are paused. Use one of your recovery codes, or try again later.', code: 'CODES_PAUSED' }]
    if (!secondStepPasses()) {
      const field = typeof body.recoveryCode === 'string' ? 'recoveryCode' : 'code'
      return [400, { message: 'That code is not right. Check it and try again. 4 tries left.', code: 'WRONG_CODE', errors: { [field]: 'That code is not right. Check it and try again.' } }]
    }
    state.pendingLogin = false
    state.loggedIn = true
    state.promptDismissed = false
    return [200, session()]
  }
  if (path === '/api/admin/session/two-factor/email-code') return [202, { message: 'A new code is on its way.' }]
  if (path === '/api/admin/session/two-factor-prompt/dismiss') {
    state.promptDismissed = true
    return [204, null]
  }
  if (path === '/api/admin/account/two-factor') return [200, twoFactorStatus()]
  if (path === '/api/admin/account/two-factor/app') return [200, { secret: SAMPLE_APP_SECRET, uri: `otpauth://totp/GPEC%20Admin%3A${encodeURIComponent(ADMIN.email)}?secret=${SAMPLE_APP_SECRET}&issuer=GPEC+Admin&algorithm=SHA1&digits=6&period=30` }]
  if (path === '/api/admin/account/two-factor/email-code') return [202, { message: `A code is on its way to ${ADMIN.email}. It works for 10 minutes.` }]
  if (path === '/api/admin/account/two-factor/enable') {
    if (body.password !== ADMIN.password) return [400, { message: 'Your password is incorrect.', code: 'WRONG_PASSWORD', errors: { password: 'Your password is incorrect.' } }]
    if (body.code !== SAMPLE_CODE) return [400, { message: 'That code is not right, or has already been used.', code: 'WRONG_CODE', errors: { code: 'That code is not right, or has already been used.' } }]
    state.twoFactorMethod = body.method as TwoFactorMethod
    state.recoveryCodes = [...SAMPLE_RECOVERY_CODES]
    return [200, { recoveryCodes: state.recoveryCodes, ...twoFactorStatus() }]
  }
  if (path === '/api/admin/account/two-factor/disable' || path === '/api/admin/account/two-factor/recovery-codes') {
    if (body.password !== ADMIN.password) return [400, { message: 'Your password is incorrect.', code: 'WRONG_PASSWORD', errors: { password: 'Your password is incorrect.' } }]
    if (!secondStepPasses()) return [400, { message: 'That code is not right, or has already been used.', code: 'WRONG_CODE', errors: { code: 'That code is not right, or has already been used.' } }]
    if (path.endsWith('/disable')) {
      state.twoFactorMethod = null
      state.recoveryCodes = []
      return [200, twoFactorStatus()]
    }
    state.recoveryCodes = SAMPLE_RECOVERY_CODES.map((code) => code.replace('abcd', 'wxyz'))
    return [200, { recoveryCodes: state.recoveryCodes, ...twoFactorStatus() }]
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
  if (path === '/api/admin/session') return [200, session()]
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
  if (path === '/api/admin/products') {
    const { items, ...paging } = listPage(state.adminProducts, url)
    return [200, { products: items, ...paging }]
  }
  const productMatch = /^\/api\/admin\/products\/([^/]+)(\/history)?$/.exec(path)
  if (productMatch) {
    const product = state.adminProducts.find((p) => p.id === productMatch[1])
    if (!product) return [404, { message: 'Product not found.', code: 'NOT_FOUND' }]
    if (productMatch[2]) return [200, historyReply(state.productHistory[product.id] ?? [], url)]
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
    const { items, ...paging } = listPage(state.deliveryAreas, url)
    return [200, { areas: items, ...paging }]
  }
  const areaMatch = /^\/api\/admin\/delivery-areas\/([^/]+)(\/history)?$/.exec(path)
  if (areaMatch) {
    const area = state.deliveryAreas.find((candidate) => candidate.id === areaMatch[1])
    if (!area) return [404, { message: 'Delivery area not found.', code: 'NOT_FOUND' }]
    if (areaMatch[2]) return [200, historyReply(state.deliveryAreaHistory[area.id] ?? [], url)]
    if (method === 'PATCH') {
      const changes = Object.entries(body).map(([field, to]) => ({ field, from: area[field as keyof AdminDeliveryArea] ?? null, to }))
      Object.assign(area, body, { updatedAt: new Date().toISOString() })
      state.deliveryAreaHistory[area.id] = [{ action: 'deliveryArea.update', actor: { name: ADMIN.name, email: ADMIN.email }, changes: changes as DeliveryAreaHistoryEntry['changes'], createdAt: area.updatedAt }, ...(state.deliveryAreaHistory[area.id] ?? [])]
    }
    return [200, { area }]
  }
  if (path === '/api/admin/bank-transfer/history') return [200, historyReply(state.bankTransferHistory, url)]
  // Like the real API: these three changes need the admin's password too, which is never stored.
  const passwordRefusal = (): Reply | null => {
    if (typeof body.password !== 'string' || !body.password) return [400, { message: 'Check the details and try again.', code: 'VALIDATION_ERROR', errors: { password: 'Enter your password.' } }]
    if (body.password !== ADMIN.password) return [400, { message: 'Your password is incorrect.', code: 'WRONG_PASSWORD', errors: { password: 'Your password is incorrect.' } }]
    delete body.password
    return null
  }
  if (path === '/api/admin/bank-transfer') {
    if (method === 'PATCH') {
      const refused = passwordRefusal()
      if (refused) return refused
      const changes = Object.entries(body).map(([field, to]) => ({ field, from: state.bankTransfer[field as keyof BankTransferSettings], to }))
      Object.assign(state.bankTransfer, body)
      state.bankTransferHistory = [{ actor: { name: ADMIN.name, email: ADMIN.email }, changes: changes as BankTransferHistoryEntry['changes'], createdAt: new Date().toISOString() }, ...state.bankTransferHistory]
    }
    return [200, { settings: state.bankTransfer, isSample: state.bankTransfer.accountNumber === '0000000000', ...historyReply(state.bankTransferHistory) }]
  }
  if (path === '/api/admin/customer-email/history') return [200, historyReply(state.customerEmailHistory, url)]
  if (path === '/api/admin/customer-email') {
    if (method === 'PATCH') {
      const refused = passwordRefusal()
      if (refused) return refused
      const replyTo = String(body.replyTo ?? '').trim().toLowerCase()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyTo)) return [400, { message: 'Check the details and try again.', code: 'VALIDATION_ERROR', errors: { replyTo: 'replyTo must be a valid email address.' } }]
      if (replyTo !== state.customerReplyTo) {
        state.customerEmailHistory = [{ actor: { name: ADMIN.name, email: ADMIN.email }, changes: [{ field: 'replyTo', from: state.customerReplyTo, to: replyTo }], createdAt: new Date().toISOString() }, ...state.customerEmailHistory]
        state.customerReplyTo = replyTo
      }
    }
    return [200, { settings: { replyTo: state.customerReplyTo }, emailOn: state.emailOn, ...historyReply(state.customerEmailHistory) }]
  }
  if (path === '/api/admin/content') return [200, { pages: Object.values(state.siteContent).map(({ key, title, approved, updatedAt }) => ({ key, title, approved, updatedAt })) }]
  const contentMatch = /^\/api\/admin\/content\/([^/]+)(\/history)?$/.exec(path)
  if (contentMatch) {
    const key = contentMatch[1] as SiteContentKey
    const stored = state.siteContent[key]
    if (!stored) return [404, { message: 'Page not found.', code: 'NOT_FOUND' }]
    if (contentMatch[2]) return [200, historyReply(state.siteContentHistory[key], url)]
    if (method === 'PATCH') {
      const fields = ['title', 'intro', 'sections', 'approved'] as const
      const changes = fields.filter((field) => Object.hasOwn(body, field) && JSON.stringify(body[field]) !== JSON.stringify(stored[field])).map((field) => ({ field, from: stored[field], to: body[field] }))
      if (changes.length > 0) {
        state.siteContent[key] = { ...stored, ...body, updatedAt: new Date().toISOString() }
        state.siteContentHistory[key] = [{ actor: { name: ADMIN.name, email: ADMIN.email }, changes: changes as SiteContentHistoryEntry['changes'], createdAt: new Date().toISOString() }, ...state.siteContentHistory[key]]
      }
    }
    return [200, { page: state.siteContent[key], ...historyReply(state.siteContentHistory[key]) }]
  }
  if (path === '/api/admin/orders') return listOrders(state.orders, url)
  const orderMatch = /^\/api\/admin\/orders\/([^/]+)(\/notes|\/history|\/transfer-received|\/transfer-not-received|\/check-payment)?$/.exec(path)
  if (orderMatch) {
    const order = state.orders.find((candidate) => candidate.reference === orderMatch[1])
    if (!order) return [404, { message: 'Order not found.', code: 'NOT_FOUND' }]
    if (orderMatch[2] === '/history') return [200, historyReply(state.orderHistory[order.reference] ?? [], url)]
    if (orderMatch[2] === '/notes' && method === 'GET') return [200, notesReply(state.requestNotes[order.reference] ?? [], url)]
    // Like the real API (backend services/checkout.ts, checkPaymentForStaff): only Paystack's answer
    // changes the order, recorded with who asked.
    if (orderMatch[2] === '/check-payment') {
      if (order.paymentMethod === 'bank_transfer') return [409, { message: 'This order is paid by bank transfer: check GPEC’s bank account instead.', code: 'NOT_A_PAYSTACK_ORDER' }]
      if (!state.paymentsOn) return [503, { message: 'Online payment is not set up, so Paystack cannot be asked.', code: 'PAYMENT_CONFIG_ERROR' }]
      let paymentCheck: PaymentCheckOutcome = state.paymentCheck
      if (order.paymentStatus === 'paid') paymentCheck = 'already_paid'
      else if (state.paymentCheckFails) return [502, { message: 'Paystack could not be reached just now. Nothing changed; try again in a moment.', code: 'PAYMENT_CHECK_FAILED' }]
      const to = paymentCheck === 'paid' ? 'paid' : paymentCheck === 'failed' && order.paymentStatus === 'pending_payment' ? 'failed' : null
      if (to) {
        state.orderHistory[order.reference] = [{ action: 'order.payment', actor: { name: ADMIN.name, email: ADMIN.email }, changes: [{ field: 'paymentStatus', from: order.paymentStatus, to }], customerEmailed: false, createdAt: new Date().toISOString() }, ...(state.orderHistory[order.reference] ?? [])]
        Object.assign(order, { paymentStatus: to, stage: to === 'paid' ? 'new' : 'payment_failed', paidAt: to === 'paid' ? new Date().toISOString() : null })
      }
      return [200, { order, emailOn: state.emailOn, paystackOn: state.paymentsOn, paymentCheck, ...historyReply(state.orderHistory[order.reference] ?? []), ...notesReply(state.requestNotes[order.reference] ?? []) }]
    }
    if (orderMatch[2] === '/transfer-received' || orderMatch[2] === '/transfer-not-received') {
      const refused = orderMatch[2] === '/transfer-received' ? passwordRefusal() : null
      if (refused) return refused
      if (order.paymentMethod !== 'bank_transfer' || order.paymentStatus !== 'pending_payment') return [409, { message: 'This order is no longer awaiting a transfer.', code: 'TRANSFER_ALREADY_SETTLED' }]
      const to = orderMatch[2] === '/transfer-received' ? 'paid' : 'failed'
      Object.assign(order, { paymentStatus: to, stage: to === 'paid' ? 'new' : 'payment_failed', paidAt: to === 'paid' ? new Date().toISOString() : null })
      // Like the real API: closing may email the customer, if asked and while email is on.
      const customerEmailed = to === 'failed' && body.notifyCustomer === true && state.emailOn
      state.orderHistory[order.reference] = [{ action: 'order.payment', actor: { name: ADMIN.name, email: ADMIN.email }, changes: [{ field: 'paymentStatus', from: 'pending_payment', to }], customerEmailed, createdAt: new Date().toISOString() }, ...(state.orderHistory[order.reference] ?? [])]
      return [200, { order, emailOn: state.emailOn, paystackOn: state.paymentsOn, ...historyReply(state.orderHistory[order.reference]), ...notesReply(state.requestNotes[order.reference] ?? []) }]
    }
    if (orderMatch[2]) {
      if (state.notesFail) return [500, { message: 'Something went wrong on our side. Please try again.' }]
      state.requestNotes[order.reference] = [{ author: { name: ADMIN.name, email: ADMIN.email }, text: String(body.text).trim(), createdAt: new Date().toISOString() }, ...(state.requestNotes[order.reference] ?? [])]
    } else if (method === 'PATCH') {
      if (order.paymentStatus !== 'paid') return [409, { message: 'Only paid orders can be moved along.', code: 'ORDER_NOT_PAID' }]
      const to = body.fulfilmentStatus as FulfilmentStatus
      if (to !== order.fulfilmentStatus) {
        const customerEmailed = body.notifyCustomer === true && state.emailOn && ['ready_for_pickup', 'out_for_delivery', 'cancelled'].includes(to)
        state.orderHistory[order.reference] = [{ action: 'order.status', actor: { name: ADMIN.name, email: ADMIN.email }, changes: [{ field: 'fulfilmentStatus', from: order.fulfilmentStatus, to }], customerEmailed, createdAt: new Date().toISOString() }, ...(state.orderHistory[order.reference] ?? [])]
        Object.assign(order, { fulfilmentStatus: to, stage: to })
      }
    }
    return [orderMatch[2] ? 201 : 200, { order, emailOn: state.emailOn, paystackOn: state.paymentsOn, ...historyReply(state.orderHistory[order.reference] ?? []), ...notesReply(state.requestNotes[order.reference] ?? []) }]
  }
  const requestMatch = /^\/api\/admin\/(contact-requests)(?:\/([^/]+))?(\/notes|\/history)?$/.exec(path)
  if (requestMatch) {
    const items = state.contactRequests
    if (!requestMatch[2]) return listRequests(items, url)
    const item = items.find((candidate) => candidate.reference === requestMatch[2])
    if (!item) return [404, { message: 'Request not found.', code: 'NOT_FOUND' }]
    if (requestMatch[3] === '/history') return [200, historyReply(state.requestHistory[item.reference] ?? [], url)]
    if (requestMatch[3] === '/notes' && method === 'GET') return [200, notesReply(state.requestNotes[item.reference] ?? [], url)]
    if (requestMatch[3]) {
      if (state.notesFail) return [500, { message: 'Something went wrong on our side. Please try again.' }]
      state.requestNotes[item.reference] = [{ author: { name: ADMIN.name, email: ADMIN.email }, text: String(body.text).trim(), createdAt: new Date().toISOString() }, ...(state.requestNotes[item.reference] ?? [])]
    } else if (method === 'PATCH' && body.status !== item.status) {
      const from = item.status
      item.status = body.status as RequestStatus
      state.requestHistory[item.reference] = [{ actor: { name: ADMIN.name, email: ADMIN.email }, changes: [{ field: 'status', from, to: item.status }], createdAt: new Date().toISOString() }, ...(state.requestHistory[item.reference] ?? [])]
    }
    return [requestMatch[3] ? 201 : 200, { item, ...historyReply(state.requestHistory[item.reference] ?? []), ...notesReply(state.requestNotes[item.reference] ?? []) }]
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
    // Photo uploads are recorded by type and size rather than content; multipart forms (the contact
    // form with files) by their fields and each file's name, type, and size.
    const contentType = (await request.headerValue('content-type')) ?? ''
    const recorded = contentType.startsWith('image/') ? { type: contentType, bytes: request.postDataBuffer()?.length ?? 0 }
      : contentType.startsWith('multipart/form-data') ? multipartBody(request.postDataBuffer() ?? Buffer.alloc(0), contentType)
      : jsonBody(request)
    state.requests.push({ method: request.method(), path, body: recorded })
    if (request.method() === 'GET' && path.startsWith('/api/product-images/')) {
      return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'image/png', 'cross-origin-resource-policy': 'cross-origin' }, body: uploadedPhoto })
    }
    // Attached files, as the real API sends them: photos to show, PDFs to download.
    const attached = /^\/api\/admin\/contact-requests\/([^/]+)\/files\/([0-9a-f]{32})$/.exec(path)
    const file = attached && state.contactRequests.find((item) => item.reference === attached[1])?.attachments.find((candidate) => candidate.id === attached[2])
    if (request.method() === 'GET' && file) {
      return route.fulfill({ status: 200, headers: { ...cors, 'cross-origin-resource-policy': 'same-site', ...(file.contentType === 'application/pdf' ? { 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="${file.name}"` } : { 'content-type': 'image/png' }) }, body: file.contentType === 'application/pdf' ? samplePdf : uploadedPhoto })
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
