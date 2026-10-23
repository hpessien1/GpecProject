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

export type StoreMode = 'catalogue' | 'order'


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
  totalPages: number
  total: number
}

export interface ProductHistoryEntry {
  action: 'product.create' | 'product.update'
  actor: { name: string, email: string }
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
  notes: RequestNote[]
}

// Orders (backend models/Order.ts). The stage is where an order stands: unpaid orders by payment
// status, paid ones by the fulfilment status staff move along.
export type FulfilmentStatus = 'new' | 'processing' | 'ready_for_pickup' | 'out_for_delivery' | 'completed' | 'cancelled'
export type OrderStage = 'awaiting_payment' | 'payment_failed' | FulfilmentStatus
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
  total: number
  currency: CurrencyInfo
}

export interface AdminOrdersPage {
  items: AdminOrderSummary[]
  page: number
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
  paymentStatus: PaymentStatus
  fulfilmentStatus: FulfilmentStatus
  paidAt: string | null
  createdAt: string
  updatedAt: string
  customer: { fullName: string, company: string, email: string, phone: string }
  fulfilmentMethod: FulfilmentMethod
  deliveryAddress: string
  items: { productId: string, name: string, reference: string, unitPrice: number, quantity: number, lineTotal: number }[]
  currency: CurrencyInfo
  subtotal: number
  deliveryFee: number
  paystackFee: number
  total: number
}

export interface OrderHistoryEntry {
  actor: { name: string, email: string }
  changes: { field: 'fulfilmentStatus', from: FulfilmentStatus, to: FulfilmentStatus }[]
  createdAt: string
}

export interface AdminOrderResponse {
  order: AdminOrderDetail
  history: OrderHistoryEntry[]
  notes: RequestNote[]
}
