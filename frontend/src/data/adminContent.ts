import type { AdminRequestKind, EditableProductFields, FulfilmentMethod, OrderStage, PaymentStatus, RequestStatus } from '../types'

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
  status: 'Status',
  sortOrder: 'Position in shop',
}

export const productStatusLabels = {
  active: 'Active (shown in the shop)',
  archived: 'Archived (hidden from the shop)',
}

export const requestStatusLabels: Record<RequestStatus, string> = {
  new: 'New',
  in_progress: 'In progress',
  closed: 'Closed',
}

export const requestKindContent: Record<AdminRequestKind, { title: string, eyebrow: string, empty: string }> = {
  'contact-requests': { title: 'Contact requests', eyebrow: 'From the contact form', empty: 'No contact requests here yet.' },
}

// Orders from the shop. Real orders arrive with Paystack checkout (ROADMAP step 5).
export const ordersContent = {
  eyebrow: 'From the shop',
  title: 'Orders',
  empty: 'No orders yet. Orders appear here once online payment through Paystack is set up: who ordered, what they bought, the amount paid, and whether they chose pickup or delivery.',
  noMatches: (search: string) => `No orders match “${search}”.`,
  notPaid: 'Payment has not been completed, so this order cannot be moved along. Only the website changes payment status, after Paystack confirms a payment.',
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
