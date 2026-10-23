import mongoose from 'mongoose'
import { ConflictError, NotFoundError, isDuplicateKeyError } from '../errors.js'
import AuditRecord from '../models/AuditRecord.js'
import Product from '../models/Product.js'
import type { ProductChanges } from '../validation/adminProduct.js'
import type { AdminIdentity } from './adminAuth.js'

export const ADMIN_PAGE_SIZE = 50
const HISTORY_LIMIT = 50
const AUDITED_FIELDS = ['name', 'reference', 'description', 'specs', 'image', 'alt', 'price', 'isPlaceholder', 'outOfStock', 'stockQuantity', 'deliveryAvailable', 'status', 'sortOrder'] as const
// Products saved before a field existed have no value for it; read them as the schema's default.
const MISSING_FIELD_DEFAULTS: Record<string, unknown> = { outOfStock: false, deliveryAvailable: true }

type StoredProduct = Record<string, unknown> & { _id: string, updatedAt?: Date }

// Everything an admin may see and edit, including price, status, and archived products.
function toAdminProduct(product: StoredProduct) {
  return {
    id: product._id,
    ...Object.fromEntries(AUDITED_FIELDS.map((field) => [field, product[field] ?? MISSING_FIELD_DEFAULTS[field] ?? null])),
    updatedAt: product.updatedAt,
  }
}

function actorOf(admin: AdminIdentity) {
  return { adminId: admin.id, email: admin.email, name: admin.name }
}

function isSameValue(a: unknown, b: unknown) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}

function rethrowConflict(error: unknown): never {
  if (isDuplicateKeyError(error)) throw new ConflictError('Another product already uses this ID or reference.', 'PRODUCT_CONFLICT')
  throw error
}

export async function listProductsForAdmin(page: number) {
  const total = await Product.countDocuments()
  const products = await Product.find().sort({ sortOrder: 1, _id: 1 }).skip((page - 1) * ADMIN_PAGE_SIZE).limit(ADMIN_PAGE_SIZE).lean()
  return { products: products.map(toAdminProduct), page, totalPages: Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE)), total }
}

export async function getProductForAdmin(id: string) {
  const product: StoredProduct | null = await Product.findById(id).lean()
  if (!product) throw new NotFoundError('Product not found.')
  return toAdminProduct(product)
}

// The product and its audit record are written in one transaction: both are saved, or neither.
export async function createProduct(admin: AdminIdentity, { id, ...fields }: ProductChanges & { id: string }) {
  let created: ReturnType<typeof toAdminProduct> | undefined
  try {
    await mongoose.connection.transaction(async (session) => {
      // New products go to the end of the list unless a position is given.
      const last = fields.sortOrder === undefined ? await Product.findOne().sort({ sortOrder: -1 }).session(session).lean() : null
      const sortOrder = fields.sortOrder ?? (last?.sortOrder ?? 0) + 10
      const [product] = await Product.create([{ ...fields, _id: id, sortOrder }], { session })
      const saved: StoredProduct = product.toObject()
      await AuditRecord.create([{
        action: 'product.create',
        targetType: 'product',
        targetId: id,
        actor: actorOf(admin),
        changes: AUDITED_FIELDS.map((field) => ({ field, from: null, to: saved[field] ?? null })),
      }], { session })
      created = toAdminProduct(saved)
    })
  } catch (error) {
    rethrowConflict(error)
  }
  return created
}

// Only fields whose value actually changes are written and recorded. Reading the old values inside
// the transaction means the "from" values are exactly what this update replaced.
export async function updateProduct(admin: AdminIdentity, id: string, changes: ProductChanges) {
  let updated: ReturnType<typeof toAdminProduct> | undefined
  try {
    await mongoose.connection.transaction(async (session) => {
      const before: StoredProduct | null = await Product.findById(id).session(session).lean()
      if (!before) throw new NotFoundError('Product not found.')
      const diffs = Object.entries(changes)
        .filter(([field, value]) => !isSameValue(before[field] ?? MISSING_FIELD_DEFAULTS[field], value))
        .map(([field, value]) => ({ field, from: before[field] ?? MISSING_FIELD_DEFAULTS[field] ?? null, to: value }))
      if (diffs.length === 0) {
        updated = toAdminProduct(before)
        return
      }
      const after: StoredProduct | null = await Product.findByIdAndUpdate(id, { $set: Object.fromEntries(diffs.map(({ field, to }) => [field, to])) }, { new: true, runValidators: true, session }).lean()
      if (!after) throw new NotFoundError('Product not found.')
      await AuditRecord.create([{ action: 'product.update', targetType: 'product', targetId: id, actor: actorOf(admin), changes: diffs }], { session })
      updated = toAdminProduct(after)
    })
  } catch (error) {
    rethrowConflict(error)
  }
  return updated
}

export async function productHistory(id: string) {
  if (!await Product.exists({ _id: id })) throw new NotFoundError('Product not found.')
  const records = await AuditRecord.find({ targetType: 'product', targetId: id }).sort({ createdAt: -1, _id: -1 }).limit(HISTORY_LIMIT).lean()
  return records.map((record) => ({
    action: record.action,
    actor: { name: record.actor?.name ?? '', email: record.actor?.email ?? '' },
    // For product.sale: the paid order that reduced the stock count.
    orderReference: record.orderReference ?? null,
    changes: record.changes,
    createdAt: record.createdAt,
  }))
}
