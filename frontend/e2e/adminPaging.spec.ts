import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { ADMIN, ADMIN_PAGE_SIZE, ORDER_REF, logInAsAdmin, mockApi, openAdminMenu } from './support/sampleApi'
import type { ApiState } from './support/sampleApi'

// Long lists in the admin, ten to a page: numbered pages (the shop's control) that remember where
// staff were, and histories and notes that load older entries on request.

const actor = { name: ADMIN.name, email: ADMIN.email }

// `count` paid orders, newest first, numbered so each can be told apart.
function manyOrders(api: ApiState, count: number) {
  const [template] = api.orders
  api.orders = Array.from({ length: count }, (_, index) => ({
    ...template,
    reference: `GPEC-O-2026-${String(index + 1).padStart(8, '0')}`,
    customer: { ...template.customer, fullName: `Customer ${index + 1}` },
  }))
}

async function openOrders(page: Page) {
  await page.getByRole('navigation', { name: 'Admin sections' }).getByRole('link', { name: 'Orders' }).click()
  await expect(page.locator('.admin-order-list > li').first()).toBeVisible()
}

const pages = (page: Page) => page.getByRole('navigation', { name: 'Order list pages' })
const orderRows = (page: Page) => page.locator('.admin-order-list > li')
const historyEntries = (page: Page) => page.locator('.admin-history > ol > li')

test.describe('admin list pages', () => {
  test('pages through orders with numbered buttons, moving focus to the top of the list', async ({ page }) => {
    const api = await mockApi(page)
    manyOrders(api, 24)
    await logInAsAdmin(page)
    await openOrders(page)
    await expect(page.getByText('Showing 1–10 of 24 orders')).toBeVisible()
    await expect(pages(page).getByRole('button', { name: /^Page \d+$/ })).toHaveText(['1', '2', '3'])
    await expect(pages(page).getByRole('button', { name: 'Page 1' })).toHaveAttribute('aria-current', 'page')
    await expect(pages(page).getByRole('button', { name: 'Previous' })).toBeDisabled()
    await pages(page).getByRole('button', { name: 'Page 3' }).click()
    await expect(page.getByRole('heading', { name: 'Orders' })).toBeFocused()
    await expect(orderRows(page)).toHaveCount(4)
    await expect(orderRows(page).first()).toContainText('Customer 21')
    await expect(page.getByText('Showing 21–24 of 24 orders')).toBeVisible()
    await expect(pages(page).getByRole('button', { name: 'Next' })).toBeDisabled()
  })

  test('shows the first, the last, and the pages around the current one when there are many, without sideways scrolling', async ({ page }) => {
    const api = await mockApi(page)
    manyOrders(api, ADMIN_PAGE_SIZE * 12)
    await logInAsAdmin(page)
    await openOrders(page)
    const nav = pages(page)
    await expect(nav.getByRole('button', { name: /^Page \d+$/ })).toHaveText(['1', '2', '12'])
    await nav.getByRole('button', { name: 'Page 12' }).click()
    for (let step = 0; step < 6; step += 1) await nav.getByRole('button', { name: 'Previous' }).click()
    await expect(nav.getByRole('button', { name: /^Page \d+$/ })).toHaveText(['1', '5', '6', '7', '12'])
    await expect(nav.getByRole('button', { name: 'Page 6' })).toHaveAttribute('aria-current', 'page')
    await expect(nav.locator('.shop-pagination-gap')).toHaveCount(2)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  })

  test('returns to the same page, filter, and search after opening an order', async ({ page }) => {
    const api = await mockApi(page)
    manyOrders(api, 24)
    await logInAsAdmin(page)
    await openOrders(page)
    await page.getByRole('searchbox', { name: 'Search' }).fill('customer')
    await page.getByRole('searchbox', { name: 'Search' }).press('Enter')
    await page.getByRole('button', { name: /^New/ }).click()
    await pages(page).getByRole('button', { name: 'Page 2' }).click()
    await expect(orderRows(page).first()).toContainText('Customer 11')
    await page.getByRole('link', { name: /^Open order GPEC-O-2026-00000011/ }).click()
    await page.getByRole('link', { name: 'Back to orders' }).click()
    await expect(orderRows(page).first()).toContainText('Customer 11')
    await expect(pages(page).getByRole('button', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page')
    await expect(page.getByRole('button', { name: /^New/ })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('searchbox', { name: 'Search' })).toHaveValue('customer')
  })

  test('shows the last page when the remembered one no longer exists', async ({ page }) => {
    const api = await mockApi(page)
    manyOrders(api, 24)
    await logInAsAdmin(page)
    await openOrders(page)
    await pages(page).getByRole('button', { name: 'Page 3' }).click()
    await expect(orderRows(page).first()).toContainText('Customer 21')
    await page.getByRole('navigation', { name: 'Admin sections' }).getByRole('link', { name: 'Products' }).click()
    manyOrders(api, 12)
    await openOrders(page)
    await expect(pages(page).getByRole('button', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page')
    await expect(page.getByText('Showing 11–12 of 12 orders')).toBeVisible()
  })

  test('a new login starts the lists from the first page', async ({ page }) => {
    const api = await mockApi(page)
    manyOrders(api, 24)
    await logInAsAdmin(page)
    await openOrders(page)
    await pages(page).getByRole('button', { name: 'Page 2' }).click()
    await expect(orderRows(page).first()).toContainText('Customer 11')
    await openAdminMenu(page)
    await page.getByRole('button', { name: 'Log out' }).click()
    await page.getByLabel('Email address').fill(ADMIN.email)
    await page.getByLabel('Password', { exact: true }).fill(ADMIN.password)
    await page.getByRole('button', { name: 'Log in' }).click()
    await openOrders(page)
    await expect(page.getByText('Showing 1–10 of 24 orders')).toBeVisible()
    await expect(pages(page).getByRole('button', { name: 'Page 1' })).toHaveAttribute('aria-current', 'page')
  })

  test('pages delivery areas and says how many there are, archived ones included', async ({ page }) => {
    const api = await mockApi(page)
    const [template] = api.deliveryAreas
    api.deliveryAreas = Array.from({ length: 13 }, (_, index) => ({ ...template, id: `${'c'.repeat(22)}${String(index).padStart(2, '0')}`, name: `Area ${index + 1}` }))
    await logInAsAdmin(page)
    await page.getByRole('navigation', { name: 'Admin sections' }).getByRole('link', { name: 'Delivery' }).click()
    await expect(page.getByText('Showing 1–10 of 13 delivery areas, including archived ones.')).toBeVisible()
    await page.getByRole('navigation', { name: 'Delivery area pages' }).getByRole('button', { name: 'Next' }).click()
    await expect(page.getByRole('heading', { name: 'Delivery areas' })).toBeFocused()
    await expect(page.locator('.admin-area-list > li')).toHaveCount(3)
    await expect(page.getByRole('link', { name: 'Edit Area 11' })).toBeVisible()
  })

  test('a single page has no page buttons, but still says what is shown', async ({ page }) => {
    await mockApi(page)
    await logInAsAdmin(page)
    await expect(page.getByText('Showing 1–7 of 7 products, including archived ones.')).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Product list pages' })).toHaveCount(0)
  })
})

test.describe('older history and notes', () => {
  test('shows a long product history a page at a time, back to the first change', async ({ page }) => {
    const api = await mockApi(page)
    api.productHistory['panel-001'] = Array.from({ length: 24 }, (_, index) => ({ action: 'product.update', actor, orderReference: null, changes: [{ field: 'sortOrder', from: 24 - index - 1, to: 24 - index }], createdAt: new Date(Date.UTC(2026, 0, 1, 0, 24 - index)).toISOString() }))
    await logInAsAdmin(page)
    await page.getByRole('link', { name: 'Edit Custom control panel' }).click()
    await expect(historyEntries(page)).toHaveCount(10)
    const showOlder = page.getByRole('button', { name: 'Show older changes' })
    await showOlder.click()
    await expect(historyEntries(page)).toHaveCount(20)
    await expect(showOlder).toBeFocused()
    await showOlder.click()
    await expect(historyEntries(page)).toHaveCount(24)
    await expect(historyEntries(page).last()).toContainText('Position in shop: 0 → 1')
    await expect(showOlder).toHaveCount(0)
    await expect(page.getByText('That is every change, back to the first.')).toBeFocused()
  })

  test('shows older notes on an order, and a new note starts again from the newest', async ({ page }) => {
    const api = await mockApi(page)
    api.requestNotes[ORDER_REF] = Array.from({ length: 12 }, (_, index) => ({ author: actor, text: `Note ${12 - index}`, createdAt: new Date(Date.UTC(2026, 0, 1, 0, 12 - index)).toISOString() }))
    await logInAsAdmin(page)
    await page.goto(`/#admin/orders/${ORDER_REF}`)
    const notes = page.locator('.admin-note-list > li')
    await expect(notes).toHaveCount(10)
    await page.getByRole('button', { name: 'Show older notes' }).click()
    await expect(notes).toHaveCount(12)
    await expect(notes.last()).toContainText('Note 1')
    await expect(page.getByText('That is every note, back to the first.')).toBeFocused()
    await page.getByLabel('Add a note').fill('Customer called back.')
    await page.getByRole('button', { name: 'Add note' }).click()
    await expect(notes.first()).toContainText('Customer called back.')
    await expect(notes).toHaveCount(10)
    await expect(page.getByRole('button', { name: 'Show older notes' })).toBeVisible()
  })

  test('says so when older changes cannot be loaded, and can try again', async ({ page }) => {
    const api = await mockApi(page)
    api.orderHistory[ORDER_REF] = Array.from({ length: 11 }, (_, index) => ({ action: 'order.status' as const, actor, changes: [{ field: 'fulfilmentStatus' as const, from: 'new' as const, to: 'processing' as const }], customerEmailed: false, createdAt: new Date(Date.UTC(2026, 0, 1, 0, 11 - index)).toISOString() }))
    await logInAsAdmin(page)
    await page.goto(`/#admin/orders/${ORDER_REF}`)
    await expect(historyEntries(page)).toHaveCount(10)
    await page.route(/\/api\/admin\/orders\/[^/]+\/history\?/, (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'Something went wrong on our side. Please try again.' }) }), { times: 1 })
    await page.getByRole('button', { name: 'Show older changes' }).click()
    await expect(page.locator('.admin-history .form-error')).toHaveText('Something went wrong on our side. Please try again.')
    await expect(historyEntries(page)).toHaveCount(10)
    await page.getByRole('button', { name: 'Show older changes' }).click()
    await expect(historyEntries(page)).toHaveCount(11)
    await expect(page.locator('.admin-history .form-error')).toHaveCount(0)
  })
})
