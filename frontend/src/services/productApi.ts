import { apiBaseUrl, getJson } from './apiClient'
import type { ProductsResponse } from '../types'

// A product's image is a file on the site (/assets/...) or an uploaded photo the API serves
// (product-images/<hash>.webp, relative to the API's address).
export function productImageUrl(image: string) {
  return image.startsWith('/') ? image : `${apiBaseUrl}/${image}`
}

export function fetchProducts(): Promise<ProductsResponse> {
  return getJson<ProductsResponse>('/products', 'Unable to load products. Please try again.')
}
