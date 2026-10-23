// Wording of every email the site sends. Plain text. Subjects contain only server-made references,
// never customer input.

export interface ContactEmailData {
  reference: string
  createdAt: Date
  fullName: string
  company: string
  email: string
  phone: string
  subject: string
  message: string
}

const received = (date: Date) => `${new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(date)} (UTC)`
const optional = (label: string, value: string) => value ? [`${label}: ${value}`] : []

export function staffContactEmail(request: ContactEmailData, siteUrl: string) {
  return {
    subject: `New contact request ${request.reference}`,
    text: [
      'A new message has arrived through the GPEC website contact form.',
      '',
      `Reference: ${request.reference}`,
      `Received: ${received(request.createdAt)}`,
      `Name: ${request.fullName}`,
      ...optional('Company', request.company),
      `Email: ${request.email}`,
      ...optional('Phone', request.phone),
      ...optional('Topic', request.subject),
      '',
      'Message:',
      request.message,
      '',
      `Open it in the admin panel: ${siteUrl}/#admin/contact-requests/${request.reference}`,
      'Reply to this email to answer the customer directly.',
    ].join('\n'),
  }
}

export interface AdminEmailData {
  name: string
  email: string
}

export function adminPasswordResetEmail(admin: AdminEmailData, link: string, minutes: number) {
  return {
    subject: 'Reset your GPEC admin password',
    text: [
      `Hello ${admin.name},`,
      '',
      'Someone asked to reset the password for your GPEC website admin account. To choose a new password, open this link:',
      '',
      link,
      '',
      `The link works once, for ${minutes} minutes. Choosing a new password logs you out everywhere.`,
      '',
      'If you did not ask for this, ignore this email: your password stays as it is.',
      '',
      'GPEC website',
    ].join('\n'),
  }
}

export function adminPasswordChangedEmail(admin: AdminEmailData, siteUrl: string) {
  return {
    subject: 'Your GPEC admin password was changed',
    text: [
      `Hello ${admin.name},`,
      '',
      'The password for your GPEC website admin account was just changed using a reset link, and you were logged out everywhere.',
      '',
      `If this was you, there is nothing to do. If it was not, ask for a new reset link at ${siteUrl}/#admin/forgot-password straight away and tell the site administrator.`,
      '',
      'GPEC website',
    ].join('\n'),
  }
}

export function customerContactEmail(request: ContactEmailData, siteUrl: string) {
  return {
    subject: `We have your message (${request.reference})`,
    text: [
      `Hello ${request.fullName},`,
      '',
      `Thank you for contacting GPEC. Your reference is ${request.reference}.`,
      '',
      'A GPEC representative will reply using the contact details you gave us.',
      '',
      'If you did not send this message, you can ignore this email.',
      '',
      'GPEC',
      siteUrl,
    ].join('\n'),
  }
}
