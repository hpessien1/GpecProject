import { getJson } from './apiClient'
import type { Product, ProductsResponse } from '../types'

export async function fetchProducts(): Promise<Product[]> {
  const { products } = await getJson<ProductsResponse>('/products', 'Unable to load products. Please try again.')
  return products
}
