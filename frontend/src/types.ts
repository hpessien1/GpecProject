export interface Product {
  id: string
  name: string
  reference: string
  description: string
  specs: string[]
  image: string
  alt: string
  // Sample data not supplied by GPEC; the shop labels it.
  isPlaceholder: boolean
  // False when out of stock: shown and labelled, but cannot be added to the cart.
  inStock: boolean
  // False: GPEC does not deliver it, so an order containing it can only be picked up.
  deliveryAvailable: boolean
  // In the currency's smallest unit (kobo for NGN); null until staff set it. Absent while the server
  // has no currency configured.
  price?: number | null
}

export interface ProductsResponse {
  products: Product[]
  // null until the server's CURRENCY setting is configured; the shop shows no prices until then.
  currency: CurrencyInfo | null
}

// What the cart stores in localStorage: product IDs and quantities only.
export interface CartEntry {
  id: string
  quantity: number
}

export interface CartLine extends CartEntry {
  product: Product
}

export type StoreMode = 'catalogue' | 'order' | 'payment'

// Checkout (backend routes/checkout.ts). Every amount comes from the server, in the currency's
// smallest unit; the browser only shows them.
export interface DeliveryArea {
  id: string
  name: string
  description: string
  fee: number
}

// paystack: paid on Paystack's page. bank_transfer: the customer transfers to GPEC's Nigerian
// account and GPEC staff confirm the money arrived.
export type PaymentMethod = 'paystack' | 'bank_transfer'

// GPEC's Nigerian bank account, as staff entered it (backend models/BankTransferSettings.ts).
export interface BankTransferDetails {
  bankName: string
  accountName: string
  // 10-digit NUBAN.
  accountNumber: string
  instructions: string
  payWithinDays: number
}

// At checkout and on orders: also whether these are still the sample details (development only),
// shown as "do not send money".
export interface OfferedBankTransfer extends BankTransferDetails {
  isSample: boolean
}

export interface CheckoutInfo {
  // False while no way to pay is open: checkout then says payment is not available yet.
  paymentsAvailable: boolean
  paymentMethods: PaymentMethod[]
  // Paystack test keys: no real money moves, and the checkout says so.
  testMode: boolean
  currency: CurrencyInfo | null
  // Shown at checkout while bank transfer is on.
  bankTransfer: OfferedBankTransfer | null
  deliveryAreas: DeliveryArea[]
}

export interface BasketPayload {
  items: { productId: string, quantity: number }[]
  fulfilmentMethod: FulfilmentMethod
  deliveryAreaId: string | null
  paymentMethod: PaymentMethod
}

export interface OrderPayload extends BasketPayload {
  fullName: string
  company: string
  email: string
  phone: string
  deliveryAddress: string
  notes: string
  // Spam trap (components/SpamTrapField.tsx): empty when a person fills in the form.
  website: string
}

export interface OrderLine {
  productId: string
  name: string
  reference: string
  unitPrice: number
  quantity: number
  lineTotal: number
}

export interface OrderQuote {
  items: OrderLine[]
  deliveryAreaName: string | null
  currency: CurrencyInfo
  subtotal: number
  deliveryFee: number
  paystackFee: number
  total: number
}

// Paystack: its payment page, where the browser goes next. Bank transfer: the order's payment
// reference, whose result page shows how to pay.
export type StartedOrder =
  | { reference: string, paymentMethod: 'paystack', authorizationUrl: string }
  | { reference: string, paymentMethod: 'bank_transfer', paymentReference: string }

// What the payment result page shows. No personal details: the link is all it takes to open it.
export interface PaymentResult extends OrderQuote {
  reference: string
  paymentMethod: PaymentMethod
  paymentStatus: PaymentStatus
  paidAt: string | null
  fulfilmentMethod: FulfilmentMethod
  // For bank transfers: the details the customer was given, the date to pay by, and when they said
  // they had paid.
  bankTransfer: (OfferedBankTransfer & { payBy: string, reportedAt: string | null }) | null
}


export interface ContactRequestPayload {
  fullName: string
  company: string
  email: string
  phone: string
  subject: string
  message: string
  // Spam trap (components/SpamTrapField.tsx): empty when a person fills in the form.
  website: string
}

export interface ContactRequestResponse {
  reference: string
  createdAt: string
}

// Admin panel

export interface CurrencyInfo {
  code: string
  // Decimal places of the smallest unit (2 for NGN: 100 kobo per naira).
  minorUnitDigits: number
}

export interface AdminSessionInfo {
  admin: { name: string, email: string }
  // null until the server's CURRENCY setting is configured; price editing is off until then.
  currency: CurrencyInfo | null
  // Whether photo uploads are set up (the server's S3 settings); until then admins pick site images.
  imageUploads: boolean
  // Two-step login for this admin: whether it is on, and whether to show the banner suggesting it.
  twoFactor: { enabled: boolean, prompt: boolean }
}

export type TwoFactorMethod = 'app' | 'email'

// The password was right; two-step login needs the code next (backend routes/adminSession.ts).
export interface LoginChallenge {
  twoFactorRequired: true
  method: TwoFactorMethod
  // "k•••@gmail.com" for email codes.
  emailHint: string | null
  // false: email is off on the server, so only a recovery code works.
  emailAvailable: boolean
}

// A 6-digit code, or one of the recovery codes instead.
export type SecondStep = { code: string } | { recoveryCode: string }

export interface TwoFactorStatus {
  method: TwoFactorMethod | null
  enabledAt: string | null
  recoveryCodesLeft: number
  // Which methods this website can offer (the encryption key, and email).
  available: { app: boolean, email: boolean }
}

export type ProductStatus = 'active' | 'archived'

// Fields an admin can edit. price is in the currency's smallest unit, or null when not set.
export interface EditableProductFields {
  name: string
  reference: string
  description: string
  specs: string[]
  image: string
  alt: string
  price: number | null
  isPlaceholder: boolean
  // Staff's out-of-stock switch, and an optional stock count (null: not counted; 0: out of stock).
  outOfStock: boolean
  stockQuantity: number | null
  // Off for products GPEC does not deliver: orders containing them are pickup only.
  deliveryAvailable: boolean
  status: ProductStatus
  sortOrder: number
}

export interface AdminProduct extends EditableProductFields {
  id: string
  updatedAt: string
}

export interface AdminProductsPage {
  products: AdminProduct[]
  page: number
  pageSize: number
  totalPages: number
  total: number
}

// One page of a change history or of notes, newest first, and the cursor for the next, older page
// (null when there is none). The admin API sends the newest page with the record.
export interface OlderPage<Entry> {
  entries: Entry[]
  cursor: string | null
}

export interface ProductHistoryEntry {
  // product.sale: a paid order reduced the stock count (the website did it, not an admin).
  action: 'product.create' | 'product.update' | 'product.sale'
  actor: { name: string, email: string }
  orderReference: string | null
  changes: { field: keyof EditableProductFields, from: unknown, to: unknown }[]
  createdAt: string
}

// Follow-up status of contact requests (same list as the backend's
// models/requestStatus.ts).
export type RequestStatus = 'new' | 'in_progress' | 'closed'

// URL segment for each kind of customer request: #admin/contact-requests (the only kind).
export type AdminRequestKind = 'contact-requests'

export interface AdminRequestSummary {
  reference: string
  status: RequestStatus
  createdAt: string
  name: string
  company: string
  email: string
  summary: string
}

export interface AdminRequestsPage {
  items: AdminRequestSummary[]
  page: number
  pageSize: number
  totalPages: number
  total: number
  counts: Record<RequestStatus, number>
}

export interface AdminRequestDetail {
  reference: string
  status: RequestStatus
  createdAt: string
  updatedAt: string
  customer: { fullName: string, company: string, email: string, phone: string }
  subject: string
  message: string
}

export interface RequestHistoryEntry {
  actor: { name: string, email: string }
  changes: { field: 'status', from: RequestStatus, to: RequestStatus }[]
  createdAt: string
}

// GPEC staff's internal note on a request, newest first. Never edited or deleted.
export interface RequestNote {
  author: { name: string, email: string }
  text: string
  createdAt: string
}

export interface AdminRequestResponse {
  item: AdminRequestDetail
  history: RequestHistoryEntry[]
  historyCursor: string | null
  notes: RequestNote[]
  notesCursor: string | null
}

// Orders (backend models/Order.ts). The stage is where an order stands: unpaid orders by payment
// status, paid ones by the fulfilment status staff move along.
export type FulfilmentStatus = 'new' | 'processing' | 'ready_for_pickup' | 'out_for_delivery' | 'completed' | 'cancelled'
export type OrderStage = 'awaiting_payment' | 'awaiting_transfer' | 'transfer_reported' | 'payment_failed' | FulfilmentStatus
export type FulfilmentMethod = 'pickup' | 'delivery'
export type PaymentStatus = 'pending_payment' | 'paid' | 'failed'

export interface AdminOrderSummary {
  reference: string
  stage: OrderStage
  createdAt: string
  name: string
  company: string
  email: string
  summary: string
  fulfilmentMethod: FulfilmentMethod
  paymentMethod: PaymentMethod
  total: number
  currency: CurrencyInfo
}

export interface AdminOrdersPage {
  items: AdminOrderSummary[]
  page: number
  pageSize: number
  totalPages: number
  total: number
  counts: Record<OrderStage, number>
}

// Amounts are whole numbers of the currency's smallest unit; unit prices are as they were when ordered.
export interface AdminOrderDetail {
  reference: string
  // Also the Paystack transaction reference.
  paymentReference: string
  stage: OrderStage
  paymentMethod: PaymentMethod
  bankTransfer: OfferedBankTransfer | null
  transferReportedAt: string | null
  paymentStatus: PaymentStatus
  fulfilmentStatus: FulfilmentStatus
  paidAt: string | null
  createdAt: string
  updatedAt: string
  customer: { fullName: string, company: string, email: string, phone: string }
  fulfilmentMethod: FulfilmentMethod
  deliveryAddress: string
  // The delivery area chosen at checkout, as it was named then.
  deliveryAreaName: string | null
  customerNotes: string
  items: { productId: string, name: string, reference: string, unitPrice: number, quantity: number, lineTotal: number }[]
  currency: CurrencyInfo
  subtotal: number
  deliveryFee: number
  paystackFee: number
  total: number
}

// order.status: staff moved fulfilment along. order.payment: staff confirmed a bank transfer
// arrived, or closed it as not received.
export type OrderHistoryEntry = {
  action: 'order.status'
  actor: { name: string, email: string }
  changes: { field: 'fulfilmentStatus', from: FulfilmentStatus, to: FulfilmentStatus }[]
  createdAt: string
} | {
  action: 'order.payment'
  actor: { name: string, email: string }
  changes: { field: 'paymentStatus', from: PaymentStatus, to: PaymentStatus }[]
  createdAt: string
}

export interface AdminOrderResponse {
  order: AdminOrderDetail
  history: OrderHistoryEntry[]
  historyCursor: string | null
  notes: RequestNote[]
  notesCursor: string | null
}

// Delivery areas and their fees, managed by staff (backend models/DeliveryArea.ts).
export interface EditableDeliveryAreaFields {
  name: string
  description: string
  fee: number
  status: ProductStatus
  sortOrder: number
}

export interface AdminDeliveryArea extends EditableDeliveryAreaFields {
  id: string
  updatedAt: string
}

export interface AdminDeliveryAreasPage {
  areas: AdminDeliveryArea[]
  page: number
  pageSize: number
  totalPages: number
  total: number
}

export interface DeliveryAreaHistoryEntry {
  action: 'deliveryArea.create' | 'deliveryArea.update'
  actor: { name: string, email: string }
  changes: { field: keyof EditableDeliveryAreaFields, from: unknown, to: unknown }[]
  createdAt: string
}

export interface BankTransferSettings extends BankTransferDetails {
  // Offered at checkout only while on.
  enabled: boolean
}

export interface BankTransferHistoryEntry {
  actor: { name: string, email: string }
  changes: { field: keyof BankTransferSettings, from: unknown, to: unknown }[]
  createdAt: string
}

export interface BankTransferResponse {
  settings: BankTransferSettings
  // Still the sample details staff started with: the live site will not offer them.
  isSample: boolean
  history: BankTransferHistoryEntry[]
  historyCursor: string | null
}

// Site text staff edit in the admin panel (backend models/SiteContent.ts): the privacy notice, the
// refunds policy, and the FAQ.
export type SiteContentKey = 'privacy' | 'refunds' | 'faq'

// For the FAQ, heading is the question and body the answer. The body is plain text: a blank line
// starts a paragraph, "- " a bullet, and [brackets] mark a placeholder (components/ContentBody.tsx).
export interface SiteContentSection {
  heading: string
  body: string
}

export interface SiteContentPage {
  key: SiteContentKey
  title: string
  intro: string
  sections: SiteContentSection[]
  // Off: the page shows "Draft for GPEC's review".
  approved: boolean
  updatedAt: string
}

export type EditableSiteContentFields = Pick<SiteContentPage, 'title' | 'intro' | 'sections' | 'approved'>

export type SiteContentSummary = Pick<SiteContentPage, 'key' | 'title' | 'approved' | 'updatedAt'>

export type SiteContentChange =
  | { field: 'title' | 'intro', from: string, to: string }
  | { field: 'approved', from: boolean, to: boolean }
  | { field: 'sections', from: SiteContentSection[], to: SiteContentSection[] }

export interface SiteContentHistoryEntry {
  actor: { name: string, email: string }
  changes: SiteContentChange[]
  createdAt: string
}

export interface SiteContentResponse {
  page: SiteContentPage
  history: SiteContentHistoryEntry[]
  historyCursor: string | null
}
