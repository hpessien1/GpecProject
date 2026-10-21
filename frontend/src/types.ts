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
