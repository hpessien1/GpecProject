import { expect, test } from '@playwright/test'
import { ADMIN, CONTACT_REF, ENQUIRY_REF, logInAsAdmin, mockApi } from './support/sampleApi'

test.describe('admin login', () => {
  test('a wrong password shows a focused message; the right one opens the panel', async ({ page }) => {
    await mockApi(page)
    await page.goto('/#admin')
    await expect(page).toHaveTitle('Admin | GPEC')
    await page.getByLabel('Email address').fill(ADMIN.email)
    await page.getByLabel('Password').fill('not the password')
    await page.getByRole('button', { name: 'Log in' }).click()
    await expect(page.locator('.form-error')).toHaveText('Email or password is incorrect.')
    await expect(page.locator('.form-error')).toBeFocused()
    await page.getByLabel('Password').fill(ADMIN.password)
    await page.getByRole('button', { name: 'Log in' }).click()
    await expect(page.getByRole('heading', { name: 'Products' })).toBeVisible()
  })

  test('returns to the login screen with a notice when the session ends', async ({ page }) => {
    const api = await mockApi(page)
    await logInAsAdmin(page)
    api.loggedIn = false
    await page.getByRole('link', { name: 'Order enquiries' }).click()
    await expect(page.getByText('Your session has ended. Please log in again.')).toBeVisible()
  })

  test('logs out', async ({ page }) => {
    const api = await mockApi(page)
    await logInAsAdmin(page)
    await page.getByRole('button', { name: 'Log out' }).click()
    await expect(page.getByText('You have logged out.')).toBeVisible()
    expect(api.requests.some((r) => r.method === 'DELETE' && r.path === '/api/admin/session')).toBe(true)
  })
})

test.describe('products and prices', () => {
  test('lists products with formatted prices and status tags', async ({ page }) => {
    await mockApi(page)
    await logInAsAdmin(page)
    const first = page.locator('.admin-product-list li').first()
    await expect(first).toContainText('Custom control panel')
    await expect(first).toContainText('₦1,500.50')
    await expect(page.locator('.admin-product-list li').nth(1)).toContainText('Archived')
  })

  test('saves only the changed field and records it in the history', async ({ page }) => {
    const api = await mockApi(page)
    await logInAsAdmin(page)
    await page.getByRole('link', { name: 'Edit Custom control panel' }).click()
    await page.getByLabel('Price').fill('2,750')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.locator('.success-message')).toHaveText('Changes saved.')
    expect(api.requests.find((r) => r.method === 'PATCH')?.body).toEqual({ price: 275000 })
    await expect(page.locator('.admin-history li').first()).toContainText('Price: ₦1,500.50 → ₦2,750.00')
  })

  test('rejects a badly typed price before sending anything', async ({ page }) => {
    const api = await mockApi(page)
    await logInAsAdmin(page)
    await page.getByRole('link', { name: 'Edit Custom control panel' }).click()
    await page.getByLabel('Price').fill('12.345')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.locator('#product-price-error')).toContainText('Enter an amount such as 1500 or 1500.50')
    expect(api.requests.some((r) => r.method === 'PATCH')).toBe(false)
  })

  test('price entry is switched off until the currency is configured', async ({ page }) => {
    await mockApi(page, { currency: null })
    await logInAsAdmin(page)
    await expect(page.getByText('the shop currency has not been configured')).toBeVisible()
    await page.getByRole('link', { name: 'Edit Custom control panel' }).click()
    await expect(page.getByLabel('Price')).toBeDisabled()
  })
})

test.describe('order enquiries and contact requests', () => {
  test('filters enquiries by status, with counts', async ({ page }) => {
    await mockApi(page)
    await logInAsAdmin(page)
    await page.getByRole('link', { name: 'Order enquiries' }).click()
    await expect(page.locator('.admin-request-list li')).toHaveCount(3)
    await page.getByRole('button', { name: /^New/ }).click()
    await expect(page.locator('.admin-request-list li')).toHaveCount(1)
    await expect(page.getByRole('button', { name: /^New/ })).toHaveAttribute('aria-pressed', 'true')
  })

  test('shows an enquiry with reply links and records a status change', async ({ page }) => {
    const api = await mockApi(page)
    await logInAsAdmin(page)
    await page.goto(`/#admin/enquiries/${ENQUIRY_REF}`)
    await expect(page.getByRole('heading', { name: ENQUIRY_REF })).toBeVisible()
    await expect(page.getByRole('link', { name: 'customer@example.com' })).toHaveAttribute('href', `mailto:customer@example.com?subject=${encodeURIComponent(`Your GPEC request ${ENQUIRY_REF}`)}`)
    await expect(page.getByRole('link', { name: '+234 800 000 0000' })).toHaveAttribute('href', 'tel:+2348000000000')
    await page.getByLabel('Follow-up status').selectOption('in_progress')
    await page.getByRole('button', { name: 'Update status' }).click()
    await expect(page.locator('.success-message')).toHaveText('Status changed to In progress.')
    expect(api.requests.find((r) => r.method === 'PATCH')?.body).toEqual({ status: 'in_progress' })
    await expect(page.locator('.admin-history li').first()).toContainText('New → In progress')
  })

  test('searches enquiries, keeps the status filter, and clears the search', async ({ page }) => {
    await mockApi(page)
    await logInAsAdmin(page)
    await page.getByRole('link', { name: 'Order enquiries' }).click()
    await expect(page.locator('.admin-request-list li')).toHaveCount(3)
    const search = page.getByRole('searchbox', { name: 'Search' })
    await search.fill('  second customer ')
    await search.press('Enter')
    await expect(page.locator('.admin-request-list li')).toHaveCount(1)
    await expect(page.locator('.admin-request-list li')).toContainText('Second Customer')
    await expect(page.getByRole('button', { name: /^In progress/ })).toContainText('1')
    await page.getByRole('button', { name: /^Closed/ }).click()
    await expect(page.getByText('Nothing matches “second customer”.')).toBeVisible()
    await page.getByRole('button', { name: 'Clear search' }).click()
    await expect(search).toHaveValue('')
    await expect(page.locator('.admin-request-list li')).toHaveCount(1)
    await expect(page.locator('.admin-request-list li')).toContainText('Third Customer')
    await expect(page.getByRole('button', { name: 'Clear search' })).toHaveCount(0)
  })

  test('adds an internal note and shows it first, with the author', async ({ page }) => {
    const api = await mockApi(page)
    await logInAsAdmin(page)
    await page.goto(`/#admin/enquiries/${ENQUIRY_REF}`)
    const notes = page.locator('.admin-note-list li')
    await expect(notes).toHaveCount(1)
    await page.getByLabel('Add a note').fill('Customer accepted the quote.')
    await page.getByRole('button', { name: 'Add note' }).click()
    await expect(page.getByText('Note added.')).toBeFocused()
    expect(api.requests.find((r) => r.method === 'POST' && r.path.endsWith('/notes'))?.body).toEqual({ text: 'Customer accepted the quote.' })
    await expect(notes).toHaveCount(2)
    await expect(notes.first()).toContainText('Customer accepted the quote.')
    await expect(notes.first()).toContainText(`${ADMIN.name} (${ADMIN.email})`)
    await expect(page.getByLabel('Add a note')).toHaveValue('')
  })

  test('keeps the note text when saving fails, and sends nothing when it is empty', async ({ page }) => {
    const api = await mockApi(page, { notesFail: true })
    await logInAsAdmin(page)
    await page.goto(`/#admin/contact-requests/${CONTACT_REF}`)
    await expect(page.getByText('No notes yet.')).toBeVisible()
    await page.getByRole('button', { name: 'Add note' }).click()
    await expect(page.getByText('Write a note before adding it.')).toBeFocused()
    expect(api.requests.some((r) => r.path.endsWith('/notes'))).toBe(false)
    await page.getByLabel('Add a note').fill('Left a voicemail.')
    await page.getByRole('button', { name: 'Add note' }).click()
    await expect(page.locator('.admin-note-form .form-error')).toHaveText('Something went wrong on our side. Please try again.')
    await expect(page.getByLabel('Add a note')).toHaveValue('Left a voicemail.')
  })

  test('shows a contact request message', async ({ page }) => {
    await mockApi(page)
    await logInAsAdmin(page)
    await page.getByRole('link', { name: 'Contact requests' }).click()
    await page.getByRole('link', { name: new RegExp(`Open ${CONTACT_REF}`) }).click()
    await expect(page.locator('.admin-request-message')).toHaveText('Please call me about a solar system.')
  })
})

test.describe('changing your own password', () => {
  test('checks length and matching before sending, then reports a wrong current password', async ({ page }) => {
    const api = await mockApi(page)
    await logInAsAdmin(page)
    await page.goto('/#admin/password')
    await page.getByLabel('Current password').fill('wrong current password')
    await page.getByLabel('New password', { exact: true }).fill('too short')
    await page.getByLabel('New password again').fill('too short')
    await page.getByRole('button', { name: 'Change password' }).click()
    await expect(page.locator('#newPassword-error')).toContainText('Use at least 15 characters')
    expect(api.requests.some((r) => r.path === '/api/admin/session/password')).toBe(false)
    await page.getByLabel('New password', { exact: true }).fill('a brand new long passphrase')
    await page.getByLabel('New password again').fill('a brand new long passphrase')
    await page.getByRole('button', { name: 'Change password' }).click()
    await expect(page.locator('#currentPassword-error')).toHaveText('Your current password is incorrect.')
    await page.getByLabel('Current password').fill(ADMIN.password)
    await page.getByRole('button', { name: 'Change password' }).click()
    await expect(page.locator('.success-message')).toContainText('Your password has been changed.')
  })
})
