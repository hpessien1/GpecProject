import type { EmailSettings } from '../config.js'
import type { EmailMessage, Mailer } from './email.js'
import { adminPasswordChangedEmail, adminPasswordResetEmail, customerContactEmail, staffContactEmail } from './emailTemplates.js'
import type { AdminEmailData, ContactEmailData } from './emailTemplates.js'

const HOUR = 60 * 60 * 1000
// Confirmations per recipient address per hour. Stops the public forms being used to flood a stranger's
// inbox (the per-IP form limit alone allows 10 per 15 minutes). Staff notifications are not capped.
const CONFIRMATIONS_PER_HOUR = 3

export interface Notifier {
  // Whether emails can be sent at all (email settings present).
  readonly isOn: boolean
  contactRequestReceived(request: ContactEmailData): Promise<void>
  // token: for the link only; it is never logged.
  passwordResetRequested(admin: AdminEmailData, token: string, minutes: number): Promise<void>
  passwordChanged(admin: AdminEmailData): Promise<void>
}

// Sends staff notifications and customer confirmations after a request is saved. Never throws: a
// failed email is logged (reference and error type only, no personal details) and the customer's
// request stands. With no mailer (email not configured), it does nothing.
export function createNotifier(mailer: Mailer | null, settings: EmailSettings | null): Notifier {
  // In memory: one API instance only (CLAUDE.md, Section 6.3).
  const recentConfirmations = new Map<string, number[]>()

  function mayConfirm(address: string) {
    const now = Date.now()
    const recent = (recentConfirmations.get(address) ?? []).filter((time) => now - time < HOUR)
    if (recent.length >= CONFIRMATIONS_PER_HOUR) return false
    recentConfirmations.set(address, [...recent, now])
    return true
  }

  async function deliver(reference: string, messages: EmailMessage[]) {
    const results = await Promise.allSettled(messages.map((message) => mailer?.send(message)))
    for (const result of results) {
      if (result.status === 'rejected') {
        const error = result.reason
        console.error(`Email for ${reference} could not be sent: ${error instanceof Error ? error.name : 'unknown error'}`)
      }
    }
  }

  return {
    isOn: mailer !== null && settings !== null,
    async contactRequestReceived(request) {
      if (!mailer || !settings) return
      const messages: EmailMessage[] = [{ to: settings.staffRecipients, replyTo: request.email, ...staffContactEmail(request, settings.siteUrl) }]
      if (mayConfirm(request.email)) messages.push({ to: [request.email], ...customerContactEmail(request, settings.siteUrl) })
      await deliver(request.reference, messages)
    },
    // The token goes after # in the link: browsers never send that part to a server, so it stays out
    // of server and proxy logs.
    async passwordResetRequested(admin, token, minutes) {
      if (!mailer || !settings) return
      await deliver('an admin password reset', [{ to: [admin.email], ...adminPasswordResetEmail(admin, `${settings.siteUrl}/#admin/reset-password/${token}`, minutes) }])
    },
    async passwordChanged(admin) {
      if (!mailer || !settings) return
      await deliver('an admin password change', [{ to: [admin.email], ...adminPasswordChangedEmail(admin, settings.siteUrl) }])
    },
  }
}
