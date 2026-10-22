import type { AdminRequestKind, EditableProductFields, RequestStatus } from '../types'

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
  'enquiries': { title: 'Order enquiries', eyebrow: 'From the shop', empty: 'No order enquiries here yet.' },
  'contact-requests': { title: 'Contact requests', eyebrow: 'From the contact form', empty: 'No contact requests here yet.' },
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
