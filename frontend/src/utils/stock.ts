import type { AdminProduct } from '../types'

// The same rule as the server (backend/src/models/Product.ts, isInStock): out of stock when staff
// switch it off, or when the stock is counted and the count is 0.
export function isInStock(product: Pick<AdminProduct, 'outOfStock' | 'stockQuantity'>) {
  return !product.outOfStock && (product.stockQuantity === null || product.stockQuantity > 0)
}
