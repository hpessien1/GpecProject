import Product from '../models/Product.js'
import { sampleProducts } from '../data/sampleProducts.js'

// What the public catalogue shows. Price is left out until step 5 configures the currency: a bare
// number with no currency would be ambiguous to the shop.
export interface PublicProduct {
  id: string
  name: string
  reference: string
  description: string
  specs: string[]
  image: string
  alt: string
  isPlaceholder: boolean
}

// More than any realistic catalogue; stops one request from reading an unbounded collection.
const MAX_PUBLIC_PRODUCTS = 1000

export async function listActiveProducts(): Promise<PublicProduct[]> {
  const products = await Product.find({ status: 'active' }).sort({ sortOrder: 1, _id: 1 }).limit(MAX_PUBLIC_PRODUCTS).lean()
  return products.map((product) => ({
    id: product._id,
    name: product.name,
    reference: product.reference,
    description: product.description,
    specs: product.specs,
    image: product.image,
    alt: product.alt,
    isPlaceholder: product.isPlaceholder,
  }))
}

// Active products with these IDs, keyed by ID. Archived or unknown IDs are absent from the map.
export async function findActiveProducts(ids: string[]) {
  const products = await Product.find({ _id: { $in: ids }, status: 'active' }).lean()
  return new Map(products.map((product) => [product._id, product]))
}

// Adds any sample product that is not in the database yet. Existing products are never changed, so
// running it again cannot undo an edit made later (for example, a price set in the admin panel).
export async function seedSampleProducts() {
  const existing = await Product.find({ _id: { $in: sampleProducts.map((product) => product.id) } }).select('_id').lean()
  const existingIds = new Set(existing.map((product) => product._id))
  const missing = sampleProducts
    .map(({ id, ...product }, index) => ({ _id: id, ...product, isPlaceholder: true, sortOrder: (index + 1) * 10 }))
    .filter((product) => !existingIds.has(product._id))
  if (missing.length > 0) await Product.insertMany(missing)
  return { added: missing.length, alreadyPresent: existingIds.size }
}
