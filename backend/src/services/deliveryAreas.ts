import mongoose from 'mongoose'
import { ConflictError, NotFoundError, isDuplicateKeyError } from '../errors.js'
import AuditRecord from '../models/AuditRecord.js'
import DeliveryArea from '../models/DeliveryArea.js'
import type { DeliveryAreaChanges } from '../validation/deliveryArea.js'
import { ADMIN_PAGE_SIZE, pageInfo, skipTo } from '../utils/paging.js'
import type { Cursor } from '../utils/paging.js'
import type { AdminIdentity } from './adminAuth.js'
import { historyPage } from './auditHistory.js'

const AUDITED_FIELDS = ['name', 'description', 'fee', 'status', 'sortOrder'] as const
// More than GPEC will ever list; stops one request from reading an unbounded collection.
const MAX_AREAS = 500

type StoredArea = Record<string, unknown> & { _id: mongoose.Types.ObjectId, updatedAt?: Date }

export interface PublicDeliveryArea {
  id: string
  name: string
  description: string
  fee: number
}

function toAdminArea(area: StoredArea) {
  return { id: String(area._id), ...Object.fromEntries(AUDITED_FIELDS.map((field) => [field, area[field] ?? null])), updatedAt: area.updatedAt }
}

function actorOf(admin: AdminIdentity) {
  return { adminId: admin.id, email: admin.email, name: admin.name }
}

function rethrowConflict(error: unknown): never {
  if (isDuplicateKeyError(error)) throw new ConflictError('Another delivery area already has this name.', 'DELIVERY_AREA_CONFLICT')
  throw error
}

// What the checkout offers: active areas in staff's order.
export async function listActiveDeliveryAreas(): Promise<PublicDeliveryArea[]> {
  const areas = await DeliveryArea.find({ status: 'active' }).sort({ sortOrder: 1, name: 1 }).limit(MAX_AREAS).lean()
  return areas.map((area) => ({ id: String(area._id), name: area.name, description: area.description, fee: area.fee }))
}

// Active areas first, then archived ones; a page at a time.
export async function listDeliveryAreasForAdmin(page: number) {
  const [total, areas] = await Promise.all([
    DeliveryArea.countDocuments(),
    DeliveryArea.find().sort({ status: 1, sortOrder: 1, name: 1, _id: 1 }).skip(skipTo(page)).limit(ADMIN_PAGE_SIZE).lean(),
  ])
  return { areas: areas.map((area) => toAdminArea(area)), ...pageInfo(page, total) }
}

export async function getDeliveryAreaForAdmin(id: string) {
  const area: StoredArea | null = await DeliveryArea.findById(id).lean()
  if (!area) throw new NotFoundError('Delivery area not found.')
  return toAdminArea(area)
}

// The area and its audit record are written in one transaction, as for products (CLAUDE.md 4.6).
export async function createDeliveryArea(admin: AdminIdentity, fields: DeliveryAreaChanges) {
  let created: ReturnType<typeof toAdminArea> | undefined
  try {
    await mongoose.connection.transaction(async (session) => {
      const last = fields.sortOrder === undefined ? await DeliveryArea.findOne().sort({ sortOrder: -1 }).session(session).lean() : null
      const sortOrder = fields.sortOrder ?? (last?.sortOrder ?? 0) + 10
      const [area] = await DeliveryArea.create([{ ...fields, sortOrder }], { session })
      const saved: StoredArea = area.toObject()
      await AuditRecord.create([{
        action: 'deliveryArea.create',
        targetType: 'deliveryArea',
        targetId: String(saved._id),
        actor: actorOf(admin),
        changes: AUDITED_FIELDS.map((field) => ({ field, from: null, to: saved[field] ?? null })),
      }], { session })
      created = toAdminArea(saved)
    })
  } catch (error) {
    rethrowConflict(error)
  }
  return created
}

// Only fields whose value changes are written and recorded. Past orders keep the fee they were charged.
export async function updateDeliveryArea(admin: AdminIdentity, id: string, changes: DeliveryAreaChanges) {
  let updated: ReturnType<typeof toAdminArea> | undefined
  try {
    await mongoose.connection.transaction(async (session) => {
      const before: StoredArea | null = await DeliveryArea.findById(id).session(session).lean()
      if (!before) throw new NotFoundError('Delivery area not found.')
      const diffs = Object.entries(changes)
        .filter(([field, value]) => (before[field] ?? null) !== value)
        .map(([field, value]) => ({ field, from: before[field] ?? null, to: value }))
      if (diffs.length === 0) {
        updated = toAdminArea(before)
        return
      }
      const after: StoredArea | null = await DeliveryArea.findByIdAndUpdate(id, { $set: Object.fromEntries(diffs.map(({ field, to }) => [field, to])) }, { new: true, runValidators: true, session }).lean()
      if (!after) throw new NotFoundError('Delivery area not found.')
      await AuditRecord.create([{ action: 'deliveryArea.update', targetType: 'deliveryArea', targetId: id, actor: actorOf(admin), changes: diffs }], { session })
      updated = toAdminArea(after)
    })
  } catch (error) {
    rethrowConflict(error)
  }
  return updated
}

export async function deliveryAreaHistory(id: string, before: Cursor | null) {
  if (!await DeliveryArea.exists({ _id: id })) throw new NotFoundError('Delivery area not found.')
  return historyPage('deliveryArea', id, before)
}
