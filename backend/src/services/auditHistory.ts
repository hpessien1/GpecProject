import AuditRecord from '../models/AuditRecord.js'
import { ADMIN_PAGE_SIZE, NEWEST_FIRST, olderThan, toPage } from '../utils/paging.js'
import type { Cursor } from '../utils/paging.js'

type AuditTarget = 'product' | 'contactRequest' | 'order' | 'deliveryArea' | 'bankTransfer'

// One page of a record's change history (models/AuditRecord.ts), newest first, and the cursor for the
// older page after it (null when there is none). Every older record stays reachable, so the admin can
// always answer "who changed this, and when?" (CLAUDE.md Section 4.6).
export async function historyPage(targetType: AuditTarget, targetId: string, before: Cursor | null) {
  const records = await AuditRecord.find({ targetType, targetId, ...olderThan(before) }).sort(NEWEST_FIRST).limit(ADMIN_PAGE_SIZE + 1).lean()
  const { entries, cursor } = toPage(records, ADMIN_PAGE_SIZE, (record) => ({
    action: record.action,
    actor: { name: record.actor?.name ?? '', email: record.actor?.email ?? '' },
    // For product.sale: the paid order that reduced the stock count.
    orderReference: record.orderReference ?? null,
    changes: record.changes,
    createdAt: record.createdAt,
  }))
  return { history: entries, historyCursor: cursor }
}
