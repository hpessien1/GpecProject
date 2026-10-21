// Wording of every email the site sends. Plain text. Subjects contain only server-made references,
// never customer input.

export interface EnquiryEmailData {
  reference: string
  createdAt: Date
  customer: { fullName: string, company: string, email: string, phone: string }
  location: string
  notes: string
  items: { name: string, reference: string, quantity: number }[]
}

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
const itemLines = (items: EnquiryEmailData['items']) => items.map((item) => `- ${item.quantity} × ${item.name} (${item.reference})`)

export function staffEnquiryEmail(enquiry: EnquiryEmailData, siteUrl: string) {
  return {
    subject: `New order enquiry ${enquiry.reference}`,
    text: [
      'A new order enquiry has arrived on the GPEC website.',
      '',
      `Reference: ${enquiry.reference}`,
      `Received: ${received(enquiry.createdAt)}`,
      `Name: ${enquiry.customer.fullName}`,
      ...optional('Company', enquiry.customer.company),
      `Email: ${enquiry.customer.email}`,
      `Phone: ${enquiry.customer.phone}`,
      ...optional('Location', enquiry.location),
      '',
      'Products:',
      ...itemLines(enquiry.items),
      ...(enquiry.notes ? ['', 'Notes from the customer:', enquiry.notes] : []),
      '',
      `Open it in the admin panel: ${siteUrl}/#admin/enquiries/${enquiry.reference}`,
      'Reply to this email to answer the customer directly.',
    ].join('\n'),
  }
}

export function customerEnquiryEmail(enquiry: EnquiryEmailData, siteUrl: string) {
  return {
    subject: `We have your GPEC enquiry (${enquiry.reference})`,
    text: [
      `Hello ${enquiry.customer.fullName},`,
      '',
      `Thank you for your order enquiry. Your reference is ${enquiry.reference}.`,
      '',
      'No payment has been taken. A GPEC representative will contact you to confirm availability, pricing, and next steps.',
      '',
      'You asked about:',
      ...itemLines(enquiry.items),
      '',
      'If you did not send this enquiry, you can ignore this email.',
      '',
      'GPEC',
      siteUrl,
    ].join('\n'),
  }
}

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
