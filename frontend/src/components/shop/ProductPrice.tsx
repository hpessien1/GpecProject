import { formatPrice } from '../../utils/money'
import type { CurrencyInfo, Product } from '../../types'

interface ProductPriceProps {
  product: Product
  // null while the server has no currency configured: then nothing is shown.
  currency: CurrencyInfo | null
  className?: string
  // Cart and checkout lines: "each", so a unit price is not read as the line's total.
  perItem?: boolean
}

// A product's price as staff set it in the admin panel. Display only: the server works out every
// amount at checkout and ignores any price the browser sends.
export default function ProductPrice({ product, currency, className = 'shop-price', perItem = false }: ProductPriceProps) {
  if (!currency || product.price === undefined) return null
  return product.price === null
    ? <p className={`${className} shop-price-pending`}>Price to be confirmed</p>
    : <p className={className}>{formatPrice(product.price, currency)}{perItem && ' each'}</p>
}
