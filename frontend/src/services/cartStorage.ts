import type { CartEntry } from '../types'

// The cart lives in this browser's localStorage and holds product IDs and quantities only, never
// prices or personal details.
const CART_STORAGE_KEY = 'gpec-order-cart'

// Keeps only well-formed entries. Whether each product still exists is checked once the catalogue
// has loaded from the API.
export function readStoredCart(): CartEntry[] {
  try {
    const parsedCart: unknown = JSON.parse(window.localStorage.getItem(CART_STORAGE_KEY) ?? '[]')
    if (!Array.isArray(parsedCart)) return []
    return parsedCart.filter((item): item is CartEntry => typeof item?.id === 'string' && Number.isInteger(item?.quantity) && item.quantity > 0)
  } catch {
    return []
  }
}

export function storeCart(cart: CartEntry[]) {
  try {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart))
  } catch {
    // Storage can be full or blocked (private browsing); the cart then lasts for this page visit only.
  }
}
