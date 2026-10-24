import { requestJson } from './apiClient'
import type { AdminDeliveryArea, AdminDeliveryAreasPage, BankTransferHistoryEntry, BankTransferResponse, BankTransferSettings, AdminOrderResponse, AdminOrdersPage, DeliveryAreaHistoryEntry, EditableDeliveryAreaFields, FulfilmentStatus, OlderPage, OrderHistoryEntry, OrderStage, AdminProduct, AdminProductsPage, AdminRequestKind, AdminRequestResponse, AdminRequestsPage, AdminSessionInfo, EditableProductFields, ProductHistoryEntry, RequestHistoryEntry, RequestNote, RequestStatus, EditableSiteContentFields, SiteContentHistoryEntry, SiteContentKey, SiteContentResponse, SiteContentSummary } from '../types'

const admin = { withCredentials: true }

// A page of a change history or of notes: the newest without `before`, else the one after that cursor.
async function historyPage<Entry>(path: string, before?: string) {
  const { history, historyCursor } = await requestJson<{ history: Entry[], historyCursor: string | null }>(`${path}${before ? `?${new URLSearchParams({ before })}` : ''}`, 'Unable to load the change history.', admin)
  return { entries: history, cursor: historyCursor } satisfies OlderPage<Entry>
}

async function notesPage(path: string, before: string) {
  const { notes, notesCursor } = await requestJson<{ notes: RequestNote[], notesCursor: string | null }>(`${path}?${new URLSearchParams({ before })}`, 'Unable to load older notes.', admin)
  return { entries: notes, cursor: notesCursor } satisfies OlderPage<RequestNote>
}

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

// The server answers the same whether or not the address has an account.
export function requestPasswordReset(email: string) {
  return requestJson<{ message: string }>('/admin/session/password-reset', 'Unable to send the reset link. Please try again.', { method: 'POST', payload: { email } })
}

// Sent with credentials so the server can clear this browser's session cookie: a reset logs out everywhere.
export function resetPassword(token: string, newPassword: string) {
  return requestJson<void>('/admin/session/password-reset/confirm', 'Unable to set your new password. Please try again.', { ...admin, method: 'POST', payload: { token, newPassword } })
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

export function getProductHistory(id: string, before?: string) {
  return historyPage<ProductHistoryEntry>(`/admin/products/${encodeURIComponent(id)}/history`, before)
}

// The photo goes as it is; the server checks, resizes, and stores it, and answers with the value to
// save in the product's image field.
export async function uploadProductImage(file: File) {
  const { image } = await requestJson<{ image: string }>('/admin/product-images', 'Unable to upload the photo.', { ...admin, method: 'POST', file })
  return image
}

export function listOrders(page: number, stage: OrderStage | null, search: string) {
  const query = new URLSearchParams({ page: String(page), ...(stage ? { stage } : {}), ...(search ? { q: search } : {}) })
  return requestJson<AdminOrdersPage>(`/admin/orders?${query}`, 'Unable to load orders.', admin)
}

export function getOrder(reference: string) {
  return requestJson<AdminOrderResponse>(`/admin/orders/${encodeURIComponent(reference)}`, 'Unable to load this order.', admin)
}

export function getOlderOrderHistory(reference: string, before: string) {
  return historyPage<OrderHistoryEntry>(`/admin/orders/${encodeURIComponent(reference)}/history`, before)
}

export function getOlderOrderNotes(reference: string, before: string) {
  return notesPage(`/admin/orders/${encodeURIComponent(reference)}/notes`, before)
}

export function setOrderStatus(reference: string, fulfilmentStatus: FulfilmentStatus) {
  return requestJson<AdminOrderResponse>(`/admin/orders/${encodeURIComponent(reference)}`, 'Unable to update the order.', { ...admin, method: 'PATCH', payload: { fulfilmentStatus } })
}

export function addOrderNote(reference: string, text: string) {
  return requestJson<AdminOrderResponse>(`/admin/orders/${encodeURIComponent(reference)}/notes`, 'Unable to save the note.', { ...admin, method: 'POST', payload: { text } })
}

export function listRequests(kind: AdminRequestKind, page: number, status: RequestStatus | null, search: string) {
  const query = new URLSearchParams({ page: String(page), ...(status ? { status } : {}), ...(search ? { q: search } : {}) })
  return requestJson<AdminRequestsPage>(`/admin/${kind}?${query}`, 'Unable to load the list.', admin)
}

export function getRequest(kind: AdminRequestKind, reference: string) {
  return requestJson<AdminRequestResponse>(`/admin/${kind}/${encodeURIComponent(reference)}`, 'Unable to load this request.', admin)
}

export function getOlderRequestHistory(kind: AdminRequestKind, reference: string, before: string) {
  return historyPage<RequestHistoryEntry>(`/admin/${kind}/${encodeURIComponent(reference)}/history`, before)
}

export function getOlderRequestNotes(kind: AdminRequestKind, reference: string, before: string) {
  return notesPage(`/admin/${kind}/${encodeURIComponent(reference)}/notes`, before)
}

export function setRequestStatus(kind: AdminRequestKind, reference: string, status: RequestStatus) {
  return requestJson<AdminRequestResponse>(`/admin/${kind}/${encodeURIComponent(reference)}`, 'Unable to update the status.', { ...admin, method: 'PATCH', payload: { status } })
}

export function addRequestNote(kind: AdminRequestKind, reference: string, text: string) {
  return requestJson<AdminRequestResponse>(`/admin/${kind}/${encodeURIComponent(reference)}/notes`, 'Unable to save the note.', { ...admin, method: 'POST', payload: { text } })
}

export function listDeliveryAreas(page: number) {
  return requestJson<AdminDeliveryAreasPage>(`/admin/delivery-areas?page=${page}`, 'Unable to load the delivery areas.', admin)
}

export async function getDeliveryArea(id: string) {
  const { area } = await requestJson<{ area: AdminDeliveryArea }>(`/admin/delivery-areas/${encodeURIComponent(id)}`, 'Unable to load the delivery area.', admin)
  return area
}

export async function createDeliveryArea(fields: Omit<EditableDeliveryAreaFields, 'sortOrder' | 'status'>) {
  const { area } = await requestJson<{ area: AdminDeliveryArea }>('/admin/delivery-areas', 'Unable to add the delivery area.', { ...admin, method: 'POST', payload: fields })
  return area
}

export async function updateDeliveryArea(id: string, changes: Partial<EditableDeliveryAreaFields>) {
  const { area } = await requestJson<{ area: AdminDeliveryArea }>(`/admin/delivery-areas/${encodeURIComponent(id)}`, 'Unable to save the delivery area.', { ...admin, method: 'PATCH', payload: changes })
  return area
}

export function getDeliveryAreaHistory(id: string, before?: string) {
  return historyPage<DeliveryAreaHistoryEntry>(`/admin/delivery-areas/${encodeURIComponent(id)}/history`, before)
}

export function getBankTransfer() {
  return requestJson<BankTransferResponse>('/admin/bank-transfer', 'Unable to load the bank details.', admin)
}

export function getOlderBankTransferHistory(before: string) {
  return historyPage<BankTransferHistoryEntry>('/admin/bank-transfer/history', before)
}

export function updateBankTransfer(changes: Partial<BankTransferSettings>) {
  return requestJson<BankTransferResponse>('/admin/bank-transfer', 'Unable to save the bank details.', { ...admin, method: 'PATCH', payload: changes })
}

// Staff checked GPEC's bank account: the transfer arrived, or it never did. Both are recorded.
export function confirmTransferReceived(reference: string) {
  return requestJson<AdminOrderResponse>(`/admin/orders/${encodeURIComponent(reference)}/transfer-received`, 'Unable to confirm the transfer.', { ...admin, method: 'POST' })
}

export function closeUnpaidTransfer(reference: string) {
  return requestJson<AdminOrderResponse>(`/admin/orders/${encodeURIComponent(reference)}/transfer-not-received`, 'Unable to close the order.', { ...admin, method: 'POST' })
}

export function listSiteContent() {
  return requestJson<{ pages: SiteContentSummary[] }>('/admin/content', 'Unable to load the site content.', admin)
}

export function getAdminSiteContent(key: SiteContentKey) {
  return requestJson<SiteContentResponse>(`/admin/content/${key}`, 'Unable to load this page.', admin)
}

export function getOlderSiteContentHistory(key: SiteContentKey, before: string) {
  return historyPage<SiteContentHistoryEntry>(`/admin/content/${key}/history`, before)
}

// Saved changes go live on the site straight away.
export function updateSiteContent(key: SiteContentKey, changes: Partial<EditableSiteContentFields>) {
  return requestJson<SiteContentResponse>(`/admin/content/${key}`, 'Unable to save this page.', { ...admin, method: 'PATCH', payload: changes })
}
