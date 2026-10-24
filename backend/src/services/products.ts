import Product, { isInStock } from '../models/Product.js'
import type { ProductCategory } from '../models/Product.js'
import { sampleProducts } from '../data/sampleProducts.js'

// What the public catalogue shows. Price (whole smallest units, e.g. kobo; null until staff set it)
// is included only when the CURRENCY setting is configured: a bare number with no currency would be
// ambiguous to the shop.
export interface PublicProduct {
  id: string
  name: string
  reference: string
  description: string
  specs: string[]
  image: string
  alt: string
  // The shop's filter group; null until staff choose one (then only under "All").
  category: ProductCategory | null
  isPlaceholder: boolean
  // Out of stock (switched off by staff, or a counted stock of 0): shown, labelled, not buyable.
  inStock: boolean
  // False: GPEC does not deliver it, so an order containing it is pickup only.
  deliveryAvailable: boolean
  price?: number | null
}

// More than any realistic catalogue; stops one request from reading an unbounded collection.
const MAX_PUBLIC_PRODUCTS = 1000

// currency: the configured CURRENCY setting, or null (prices left out).
export async function listActiveProducts(currency: string | null): Promise<PublicProduct[]> {
  const products = await Product.find({ status: 'active' }).sort({ sortOrder: 1, _id: 1 }).limit(MAX_PUBLIC_PRODUCTS).lean()
  return products.map((product) => ({
    id: product._id,
    name: product.name,
    reference: product.reference,
    description: product.description,
    specs: product.specs,
    image: product.image,
    alt: product.alt,
    category: product.category ?? null,
    isPlaceholder: product.isPlaceholder,
    inStock: isInStock(product),
    deliveryAvailable: product.deliveryAvailable !== false,
    ...(currency ? { price: product.price ?? null } : {}),
  }))
}

// Adds any sample product that is not in the database yet. Existing products are never changed, so
// running it again cannot undo an edit made later (for example, a price set in the admin panel), with
// one narrow exception (the user's choice, 2026-10-24): a sample product (isPlaceholder) that has no
// category yet gets its sample category, because categories came after the samples were first loaded.
// A category staff chose, and every real product, are left alone.
export async function seedSampleProducts() {
  const existing = await Product.find({ _id: { $in: sampleProducts.map((product) => product.id) } }).select('_id').lean()
  const existingIds = new Set(existing.map((product) => product._id))
  const missing = sampleProducts
    .map(({ id, ...product }, index) => ({ _id: id, ...product, isPlaceholder: true, sortOrder: (index + 1) * 10 }))
    .filter((product) => !existingIds.has(product._id))
  if (missing.length > 0) await Product.insertMany(missing)
  let categorised = 0
  for (const product of sampleProducts.filter((sample) => existingIds.has(sample.id))) {
    const update = await Product.updateOne({ _id: product.id, isPlaceholder: true, category: null }, { $set: { category: product.category } })
    categorised += update.matchedCount
  }
  return { added: missing.length, alreadyPresent: existingIds.size, categorised }
}
