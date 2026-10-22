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
}

export interface ProductsResponse {
  products: Product[]
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

export interface EnquiryPayload {
  customer: {
    fullName: string
    company: string
    email: string
    phone: string
  }
  location: string
  notes: string
  items: { productId: string, quantity: number }[]
  // Spam trap (components/SpamTrapField.tsx): empty when a person fills in the form.
  website: string
}

export interface EnquiryResponse {
  reference: string
  createdAt: string
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

export type ContactRequestResponse = EnquiryResponse

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

// Follow-up status of order enquiries and contact requests (same list as the backend's
// models/requestStatus.ts).
export type RequestStatus = 'new' | 'in_progress' | 'closed'

// URL segment for each kind of request: #admin/enquiries, #admin/contact-requests.
export type AdminRequestKind = 'enquiries' | 'contact-requests'

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

// Order enquiries have location, notes, and items; contact requests have subject and message.
export interface AdminRequestDetail {
  reference: string
  status: RequestStatus
  createdAt: string
  updatedAt: string
  customer: { fullName: string, company: string, email: string, phone: string }
  location?: string
  notes?: string
  items?: { productId: string, name: string, reference: string, quantity: number }[]
  subject?: string
  message?: string
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
