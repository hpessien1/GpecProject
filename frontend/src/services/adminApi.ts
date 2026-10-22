import { requestJson } from './apiClient'
import type { AdminProduct, AdminProductsPage, AdminRequestKind, AdminRequestResponse, AdminRequestsPage, AdminSessionInfo, EditableProductFields, ProductHistoryEntry, RequestStatus } from '../types'

const admin = { withCredentials: true }

export function getAdminSession() {
  return requestJson<AdminSessionInfo>('/admin/session', 'Unable to check your login.', admin)
}

export function logIn(email: string, password: string) {
  return requestJson<AdminSessionInfo>('/admin/session', 'Unable to log in. Please try again.', { ...admin, method: 'POST', payload: { email, password } })
}

export function logOut() {
  return requestJson<void>('/admin/session', 'Unable to log out. Please try again.', { ...admin, method: 'DELETE' })
}

export function changePassword(currentPassword: string, newPassword: string) {
  return requestJson<void>('/admin/session/password', 'Unable to change your password. Please try again.', { ...admin, method: 'POST', payload: { currentPassword, newPassword } })
}

export function listAdminProducts(page: number) {
  return requestJson<AdminProductsPage>(`/admin/products?page=${page}`, 'Unable to load products.', admin)
}

export async function getAdminProduct(id: string) {
  const { product } = await requestJson<{ product: AdminProduct }>(`/admin/products/${encodeURIComponent(id)}`, 'Unable to load the product.', admin)
  return product
}

export async function createProduct(fields: Omit<EditableProductFields, 'sortOrder'> & { id: string, sortOrder?: number }) {
  const { product } = await requestJson<{ product: AdminProduct }>('/admin/products', 'Unable to create the product.', { ...admin, method: 'POST', payload: fields })
  return product
}

export async function updateProduct(id: string, changes: Partial<EditableProductFields>) {
  const { product } = await requestJson<{ product: AdminProduct }>(`/admin/products/${encodeURIComponent(id)}`, 'Unable to save the product.', { ...admin, method: 'PATCH', payload: changes })
  return product
}

export async function getProductHistory(id: string) {
  const { history } = await requestJson<{ history: ProductHistoryEntry[] }>(`/admin/products/${encodeURIComponent(id)}/history`, 'Unable to load the change history.', admin)
  return history
}

// The photo goes as it is; the server checks, resizes, and stores it, and answers with the value to
// save in the product's image field.
export async function uploadProductImage(file: File) {
  const { image } = await requestJson<{ image: string }>('/admin/product-images', 'Unable to upload the photo.', { ...admin, method: 'POST', file })
  return image
}

export function listRequests(kind: AdminRequestKind, page: number, status: RequestStatus | null, search: string) {
  const query = new URLSearchParams({ page: String(page), ...(status ? { status } : {}), ...(search ? { q: search } : {}) })
  return requestJson<AdminRequestsPage>(`/admin/${kind}?${query}`, 'Unable to load the list.', admin)
}

export function getRequest(kind: AdminRequestKind, reference: string) {
  return requestJson<AdminRequestResponse>(`/admin/${kind}/${encodeURIComponent(reference)}`, 'Unable to load this request.', admin)
}

export function setRequestStatus(kind: AdminRequestKind, reference: string, status: RequestStatus) {
  return requestJson<AdminRequestResponse>(`/admin/${kind}/${encodeURIComponent(reference)}`, 'Unable to update the status.', { ...admin, method: 'PATCH', payload: { status } })
}

export function addRequestNote(kind: AdminRequestKind, reference: string, text: string) {
  return requestJson<AdminRequestResponse>(`/admin/${kind}/${encodeURIComponent(reference)}/notes`, 'Unable to save the note.', { ...admin, method: 'POST', payload: { text } })
}
