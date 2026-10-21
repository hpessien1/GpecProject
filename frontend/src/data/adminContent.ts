import type { EditableProductFields } from '../types'

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
