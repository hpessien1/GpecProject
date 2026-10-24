import type { AdminRequestKind, BankTransferSettings, EditableDeliveryAreaFields, EditableProductFields, PaymentMethod, FulfilmentMethod, OrderStage, PaymentStatus, RequestStatus, EditableSiteContentFields, SiteContentKey } from '../types'

// Labels for product fields, shared by the edit form and the change history.
export const productFieldLabels: Record<keyof EditableProductFields | 'id', string> = {
  id: 'Product ID',
  name: 'Name',
  reference: 'Product code',
  description: 'Description',
  specs: 'Specifications',
  image: 'Image',
  alt: 'Image description',
  price: 'Price',
  isPlaceholder: 'Sample listing',
  outOfStock: 'Out of stock',
  stockQuantity: 'Stock count',
  deliveryAvailable: 'Delivery available',
  status: 'Status',
  sortOrder: 'Position in shop',
}

export const productStatusLabels = {
  active: 'Active (shown in the shop)',
  archived: 'Archived (hidden from the shop)',
}

export const deliveryAreaFieldLabels: Record<keyof EditableDeliveryAreaFields, string> = {
  name: 'Area name',
  description: 'What it covers',
  fee: 'Delivery fee',
  status: 'Status',
  sortOrder: 'Position in list',
}

export const deliveryAreaStatusLabels = {
  active: 'Active (offered at checkout)',
  archived: 'Archived (not offered)',
}

// Delivery areas: GPEC's own list of where it delivers and for how much (owner's choice, 2026-10-23,
// instead of a distance calculation, which would need a mapping service and send customers' addresses
// to it).
export const deliveryAreasContent = {
  eyebrow: 'Shop',
  title: 'Delivery areas',
  intro: 'Customers who choose delivery pick one of these areas at checkout, and its fee is added to their order. Name areas so customers can find theirs, for example “Port Harcourt: Woji, GRA, Trans-Amadi” or “Within 10 km of Woji”. A customer whose area is not listed can choose pickup or contact GPEC.',
  empty: 'No delivery areas yet, so customers can only choose pickup. Add the first area below.',
  noCurrency: 'Delivery fees cannot be set yet: the shop currency has not been configured.',
  pastOrders: 'Changing a fee or name does not change orders already placed: each order keeps the area and fee it was charged.',
}

export const paymentMethodLabels: Record<PaymentMethod, string> = {
  paystack: 'Paystack',
  bank_transfer: 'Bank transfer',
}

export const bankTransferFieldLabels: Record<keyof BankTransferSettings, string> = {
  enabled: 'Offer bank transfer at checkout',
  bankName: 'Bank name',
  accountName: 'Account name',
  accountNumber: 'Account number',
  instructions: 'Extra instructions for customers',
  payWithinDays: 'Days to pay within',
}

// GPEC's Nigerian bank account for customers who pay by transfer. What a Nigerian transfer needs: the
// bank, the account name, and the 10-digit NUBAN account number (no sort code or SWIFT code).
export const bankTransferContent = {
  eyebrow: 'Shop',
  title: 'Bank details',
  intro: 'Customers who choose bank transfer at checkout see these details, with the amount and their order reference to use as the narration. Their order waits as “Awaiting transfer” until you confirm on the order that the money arrived.',
  warning: 'These details decide where customers send their money. Every change is recorded and emailed to all admins. Check them carefully before saving.',
  noCurrency: 'Bank transfer is offered only while the shop currency is naira (NGN).',
  sample: 'These are sample details, not a real account, for testing. Customers are told not to send money while they are shown. Replace the bank, account name, and account number with GPEC’s own before the site is used for real.',
  hints: {
    bankName: 'The bank as customers will find it in their banking app, e.g. Access Bank, GTBank, Zenith Bank.',
    accountName: 'Exactly as the bank has it, e.g. GPEC Engineering Company Limited. Customers check it before sending.',
    accountNumber: 'The 10-digit account number (NUBAN).',
    instructions: 'Optional, e.g. where to send proof of payment.',
    payWithinDays: 'Customers are asked to pay within this many days. Close unpaid orders by hand after that (“Payment not received” on the order).',
  },
}

export const requestStatusLabels: Record<RequestStatus, string> = {
  new: 'New',
  in_progress: 'In progress',
  closed: 'Closed',
}

export const requestKindContent: Record<AdminRequestKind, { title: string, eyebrow: string, empty: string }> = {
  'contact-requests': { title: 'Contact requests', eyebrow: 'From the contact form', empty: 'No contact requests here yet.' },
}

// Orders from the shop's checkout. Unpaid ones are customers who did not finish paying on Paystack.
export const ordersContent = {
  eyebrow: 'From the shop',
  title: 'Orders',
  empty: 'No orders yet. Orders placed in the shop appear here: who ordered, what they bought, the amount, and whether they chose pickup or delivery.',
  noMatches: (search: string) => `No orders match “${search}”.`,
  notPaid: 'Payment has not been completed, so this order cannot be moved along. Only the website changes payment status, after Paystack confirms a payment.',
  transferWaiting: 'The customer chose bank transfer. Check GPEC’s bank account for this amount with the order reference as the narration, then confirm it here. The order can be moved along once it is paid.',
  transferClosed: 'Closed as not received: the transfer never arrived. If the customer did pay, they can contact GPEC; place a new order for them if needed.',
}

// In the order a typical order moves through them.
export const orderStageLabels: Record<OrderStage, string> = {
  new: 'New',
  processing: 'Processing',
  ready_for_pickup: 'Ready for pickup',
  out_for_delivery: 'Out for delivery',
  completed: 'Completed',
  cancelled: 'Cancelled',
  awaiting_payment: 'Awaiting payment',
  awaiting_transfer: 'Awaiting transfer',
  transfer_reported: 'Transfer reported',
  payment_failed: 'Payment failed',
}

export const fulfilmentMethodLabels: Record<FulfilmentMethod, string> = {
  pickup: 'Pickup',
  delivery: 'Delivery',
}

export const paymentStatusLabels: Record<PaymentStatus, string> = {
  pending_payment: 'Awaiting payment',
  paid: 'Paid',
  failed: 'Payment failed',
}

export const requestSearchContent = {
  label: 'Search',
  help: 'Reference, customer name, company, or email.',
  noMatches: (search: string) => `Nothing matches “${search}”.`,
}

export const requestNotesContent = {
  title: 'Internal notes',
  help: 'Only GPEC staff can see notes. A note cannot be edited or deleted once added.',
  label: 'Add a note',
  empty: 'No notes yet.',
}

// Under a change history or a list of notes (components/admin/AdminOlderEntries.tsx).
export const olderEntriesContent = {
  history: { button: 'Show older changes', end: 'That is every change, back to the first.', error: 'Unable to load older changes.' },
  notes: { button: 'Show older notes', end: 'That is every note, back to the first.', error: 'Unable to load older notes.' },
}

// Site content (#admin/content): the FAQ, the refunds policy, and the privacy notice, edited by staff.
export const siteContentAdmin = {
  eyebrow: 'Website',
  title: 'Site content',
  intro: 'The wording of the FAQ, the refunds policy, and the privacy notice on the website. Saving puts your changes on the website straight away, and every change is kept in the page’s history with what it said before.',
  draftNote: 'The FAQ and the refunds policy were first written by the website’s developer as suggestions. Check every rule and every highlighted [bracket] with GPEC’s management (and, for the policies, a legal adviser) before marking a page approved.',
  status: { approved: 'Approved', draft: 'Draft' },
  formatHelp: [
    'Leave an empty line between paragraphs.',
    'Start a line with “- ” to make a bullet point.',
    'Put anything still to be confirmed in [square brackets]: the website highlights it.',
  ],
  approvedLabel: 'Approved by GPEC: remove the “Draft for GPEC’s review” notice from the website.',
  approvedHint: 'Leave this off until GPEC has agreed the wording. While it is off, visitors see that the page is a draft.',
  saved: 'Saved. The website now shows this version.',
  noChanges: 'No changes to save.',
  unsaved: 'You have changes that are not saved yet.',
}

// What each page calls its parts in the editor.
export const siteContentItemLabels: Record<SiteContentKey, { item: string, heading: string, body: string }> = {
  privacy: { item: 'Section', heading: 'Heading', body: 'Text' },
  refunds: { item: 'Section', heading: 'Heading', body: 'Text' },
  faq: { item: 'Question', heading: 'Question', body: 'Answer' },
}

export const siteContentFieldLabels: Record<keyof EditableSiteContentFields, string> = {
  title: 'Page title',
  intro: 'Introduction',
  sections: 'Sections',
  approved: 'Approved',
}

// Two-step login (#admin/security, the login code step, and the banner suggesting it).
export const twoFactorContent = {
  banner: {
    title: 'Protect your account with two-step login',
    text: 'Your admin account can change prices, confirm payments, and change GPEC’s bank details. With two-step login, someone who learns your password still cannot log in without a code from your phone or email.',
    action: 'Turn on two-step login',
    dismiss: 'Not now',
  },
  page: {
    eyebrow: 'Your account',
    title: 'Two-step login',
    intro: 'After your password, you also enter a 6-digit code: from an app on your phone, or sent to your email. It keeps your account safe if your password is ever guessed or leaked.',
  },
  methods: {
    app: { label: 'Authenticator app (recommended)', hint: 'A free app such as Google Authenticator or Microsoft Authenticator shows a new code every 30 seconds. Works without signal or internet.', unavailable: 'Not available yet: the website’s settings for authenticator apps are not in place. Ask the site administrator.' },
    email: { label: 'Code by email', hint: 'A code is emailed to you each time you log in. Only as safe as your email account, and you must be able to read your email to log in.', unavailable: 'Not available: email is not set up on this website.' },
  },
  appSteps: [
    'Install an authenticator app on your phone if you do not have one, such as Google Authenticator or Microsoft Authenticator.',
    'In the app, add an account and scan this QR code. If you cannot scan it, type in the key below instead.',
    'Enter the 6-digit code the app shows.',
  ],
  recovery: {
    title: 'Save your recovery codes',
    text: 'If you lose your phone or cannot get a code, each of these codes gets you in once instead. Keep them somewhere safe, away from your password: print them, or save them in a password manager. They are shown only now.',
    confirm: 'I have saved my recovery codes somewhere safe.',
    lowWarning: 'You are running low on recovery codes. Make new ones.',
  },
  disableWarning: 'Turning it off means logging in needs only your password.',
  loginHelp: {
    app: 'Open your authenticator app and enter the 6-digit code for GPEC Admin.',
    email: (hint: string) => `We have emailed a 6-digit code to ${hint}. It works for 10 minutes. Check your spam folder if it does not arrive.`,
    emailUnavailable: 'Codes cannot be emailed right now. Use one of your recovery codes instead.',
    recovery: 'Enter one of the recovery codes you saved when you turned on two-step login. Each one works once.',
  },
}
