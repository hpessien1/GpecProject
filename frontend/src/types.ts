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
