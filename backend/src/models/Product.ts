import mongoose from 'mongoose'

export const PRODUCT_STATUSES = ['active', 'archived'] as const
// The shop's filters, the same four groups as the home page's Products section (frontend
// data/landingContent.ts, productGroups). Accessories belong to their parent group.
export const PRODUCT_CATEGORIES = ['electrical', 'solar', 'electronics', 'industrial'] as const
export type ProductCategory = typeof PRODUCT_CATEGORIES[number]
export const MAX_STOCK_QUANTITY = 1_000_000

// Whether customers can buy the product now. The shop shows only this, never the stock count.
export function isInStock(product: { outOfStock?: boolean | null, stockQuantity?: number | null }) {
  return !product.outOfStock && (product.stockQuantity == null || product.stockQuantity > 0)
}

const productSchema = new mongoose.Schema({
  // The product's short key (e.g. "panel-001"), used in carts and orders. Not the
  // customer-facing code, which is `reference`.
  _id: { type: String, required: true, trim: true, match: /^[a-z0-9-]{1,60}$/ },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  reference: { type: String, required: true, trim: true, maxlength: 40, unique: true },
  description: { type: String, required: true, trim: true, maxlength: 1000 },
  specs: { type: [{ type: String, trim: true, maxlength: 80 }], default: [] },
  image: { type: String, required: true, trim: true, maxlength: 300 },
  alt: { type: String, required: true, trim: true, maxlength: 300 },
  // One of PRODUCT_CATEGORIES, chosen by staff; null (and absent on products saved before 2026-10-24)
  // until chosen, and then the product is listed only under "All" in the shop.
  category: { type: String, enum: [...PRODUCT_CATEGORIES, null], default: null },
  // Integer in the currency's smallest unit (kobo if the currency is confirmed as NGN). Null until
  // GPEC sets a price; never shown or charged until then.
  price: { type: Number, default: null, min: 0, validate: { validator: (value: number | null) => value === null || Number.isInteger(value), message: 'price must be a whole number of the smallest currency unit.' } },
  // True for sample data that GPEC has not supplied or approved; the shop labels these.
  isPlaceholder: { type: Boolean, default: false },
  // Staff switch this on when GPEC cannot supply the product for now: it stays in the shop, labelled
  // "Out of stock", and cannot be bought. (To take a product out of the shop, archive it.)
  outOfStock: { type: Boolean, default: false },
  // Optional count of units GPEC holds. null: not counted, so only outOfStock matters. When counted,
  // 0 means out of stock. Customers never see the number (services/products.ts).
  stockQuantity: { type: Number, default: null, min: 0, max: MAX_STOCK_QUANTITY, validate: { validator: (value: number | null) => value === null || Number.isInteger(value), message: 'stockQuantity must be a whole number.' } },
  // Off for products GPEC does not deliver (e.g. a large panel): an order containing one can only be
  // picked up. The server enforces it at checkout.
  deliveryAvailable: { type: Boolean, default: true },
  // Archived products disappear from the shop but stay in the database for past orders.
  status: { type: String, enum: PRODUCT_STATUSES, default: 'active' },
  sortOrder: { type: Number, default: 0 },
}, { timestamps: true, strict: 'throw' })

productSchema.index({ status: 1, sortOrder: 1 })

export default mongoose.model('Product', productSchema)
