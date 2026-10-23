import mongoose from 'mongoose'
import { ValidationError } from '../errors.js'
import AdminUser from '../models/AdminUser.js'
import AuditRecord from '../models/AuditRecord.js'
import BankTransferSettings, { BANK_TRANSFER_SETTINGS_ID } from '../models/BankTransferSettings.js'
import type { BankTransferChanges } from '../validation/bankTransfer.js'
import type { AdminIdentity } from './adminAuth.js'
import type { Notifier } from './notifications.js'

// GPEC's account is Nigerian (bank, account name, 10-digit NUBAN number), so transfers are in naira.
export const BANK_TRANSFER_CURRENCY = 'NGN'

const FIELDS = ['enabled', 'bankName', 'accountName', 'accountNumber', 'instructions', 'payWithinDays'] as const
const HISTORY_LIMIT = 50
// What the Bank details screen starts with, for staff to replace with GPEC's real account. Plainly not
// real: no bank has that name, and 0000000000 is no one's account number, so a customer who somehow saw
// it could not send money to a stranger. Checkout, the instructions, and the email label it "do not
// send money" (isSampleAccount). Replacing it is on the launch checklist (CLAUDE.md Section 7).
export const SAMPLE_BANK_DETAILS = {
  bankName: 'Sample Bank (not real)',
  accountName: 'SAMPLE – replace with GPEC’s account name',
  accountNumber: '0000000000',
}

const DEFAULTS = { enabled: false, ...SAMPLE_BANK_DETAILS, instructions: '', payWithinDays: 3 }

// True while any of the bank, account name, or account number is still the sample's.
export function isSampleAccount(details: { bankName: string, accountName: string, accountNumber: string }) {
  return details.bankName === SAMPLE_BANK_DETAILS.bankName || details.accountName === SAMPLE_BANK_DETAILS.accountName || details.accountNumber === SAMPLE_BANK_DETAILS.accountNumber
}

// isSample: the sample details, which checkout and emails label "do not send money".
export type BankTransferDetails = Omit<typeof DEFAULTS, 'enabled'> & { isSample: boolean }

function toSettings(stored: Record<string, unknown> | null) {
  return Object.fromEntries(FIELDS.map((field) => [field, stored?.[field] ?? DEFAULTS[field]])) as typeof DEFAULTS
}

function isComplete(settings: typeof DEFAULTS) {
  return Boolean(settings.bankName && settings.accountName && settings.accountNumber)
}

export async function getBankTransferSettings() {
  return toSettings(await BankTransferSettings.findById(BANK_TRANSFER_SETTINGS_ID).lean())
}

// What checkout offers: the details only while staff have switched bank transfer on. The sample
// details can be offered too, while the site is being tested (owner, 2026-10-23), always labelled.
export async function activeBankTransfer(): Promise<BankTransferDetails | null> {
  const { enabled, ...details } = await getBankTransferSettings()
  if (!enabled || !isComplete({ enabled, ...details })) return null
  return { ...details, isSample: isSampleAccount(details) }
}

// Saved with its audit record in one transaction. Turning it on needs the bank, account name, and
// account number. After saving, every active admin is emailed what changed.
export async function updateBankTransferSettings(admin: AdminIdentity, changes: BankTransferChanges, notifier: Notifier) {
  let diffs: { field: string, from: unknown, to: unknown }[] = []
  let saved = DEFAULTS
  await mongoose.connection.transaction(async (session) => {
    const before = toSettings(await BankTransferSettings.findById(BANK_TRANSFER_SETTINGS_ID).session(session).lean())
    const after = { ...before, ...changes }
    if (after.enabled && !isComplete(after)) {
      throw new ValidationError({ enabled: 'Fill in the bank, account name, and account number before turning bank transfer on.' }, 'Fill in the bank, account name, and account number before turning bank transfer on.')
    }
    diffs = FIELDS.filter((field) => before[field] !== after[field]).map((field) => ({ field, from: before[field], to: after[field] }))
    saved = after
    if (diffs.length === 0) return
    // Every field is written, not only the changed ones: the first save creates the record, and the
    // sample values it started from must be stored too, not the model's empty defaults.
    await BankTransferSettings.findOneAndUpdate({ _id: BANK_TRANSFER_SETTINGS_ID }, { $set: Object.fromEntries(FIELDS.map((field) => [field, after[field]])) }, { upsert: true, runValidators: true, session })
    await AuditRecord.create([{ action: 'bankTransfer.update', targetType: 'bankTransfer', targetId: BANK_TRANSFER_SETTINGS_ID, actor: { adminId: admin.id, email: admin.email, name: admin.name }, changes: diffs }], { session })
  })
  if (diffs.length > 0) {
    const admins = await AdminUser.find({ isActive: true }).select('email').lean()
    void notifier.bankDetailsChanged(admins.map((account) => account.email), admin, diffs.map(({ field }) => field), saved)
  }
  return saved
}

export async function bankTransferHistory() {
  const records = await AuditRecord.find({ targetType: 'bankTransfer', targetId: BANK_TRANSFER_SETTINGS_ID }).sort({ createdAt: -1, _id: -1 }).limit(HISTORY_LIMIT).lean()
  return records.map((record) => ({ actor: { name: record.actor?.name ?? '', email: record.actor?.email ?? '' }, changes: record.changes, createdAt: record.createdAt }))
}
