import { expect, test } from '@playwright/test'
import { mockApi, sampleProducts } from './support/sampleApi'

test.describe('shop catalogue', () => {
  test('lists products from the API, labelled as samples, six per page', async ({ page }) => {
    await mockApi(page)
    await page.goto('/#shop')
    await expect(page.getByText('Showing 1–6 of 7 products')).toBeVisible()
    await expect(page.locator('.shop-product-card')).toHaveCount(6)
    await expect(page.locator('.shop-product-card .shop-sample-label').first()).toHaveText('Sample listing · details to be confirmed by GPEC')
    await page.getByRole('navigation', { name: 'Product catalogue pages' }).getByRole('button', { name: 'Next' }).click()
    await expect(page.getByText('Showing 7–7 of 7 products')).toBeVisible()
  })

  test('explains a loading failure and recovers with Try again', async ({ page }) => {
    const api = await mockApi(page, { products: 'error' })
    await page.goto('/#shop')
    await expect(page.getByRole('alert')).toContainText('Products could not be loaded.')
    api.products = sampleProducts()
    await page.getByRole('button', { name: 'Try again' }).click()
    await expect(page.locator('.shop-product-card')).toHaveCount(6)
  })

  test('says so when there are no products yet', async ({ page }) => {
    await mockApi(page, { products: [] })
    await page.goto('/#shop')
    await expect(page.getByText('No products are listed yet.')).toBeVisible()
  })

  test('the header logo goes home, and the "Product ordering" label is not a link', async ({ page }) => {
    await mockApi(page)
    await page.goto('/#shop')
    const label = page.locator('.shop-topbar').getByText('Product ordering')
    if (await label.isVisible()) {
      await expect(label).not.toHaveAttribute('href')
      await expect(page.locator('.shop-topbar a', { hasText: 'Product ordering' })).toHaveCount(0)
    }
    await page.getByRole('link', { name: 'Return to GPEC home' }).click()
    await expect(page).toHaveURL(/\/(#home)?$/)
    await expect(page.locator('.hero')).toBeVisible()
  })

  test('the header logo loads a small copy, not the 1.1 MB original', async ({ page }) => {
    await mockApi(page)
    const logoRequests: string[] = []
    page.on('request', (request) => { if (request.url().includes('gpec-engineering-logo-plinth')) logoRequests.push(new URL(request.url()).pathname) })
    await page.goto('/#shop')
    await expect.poll(() => page.locator('header .brand-logo').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
    expect(logoRequests.length).toBeGreaterThan(0)
    expect(logoRequests.every((path) => path.endsWith('.webp'))).toBe(true)
  })

  test('skip link moves to the products without leaving the shop', async ({ page }) => {
    await mockApi(page)
    await page.goto('/#shop')
    await page.locator('.shop-product-card').first().waitFor()
    await page.keyboard.press('Tab')
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/#shop$/)
    await expect(page.locator('#shop-main')).toBeFocused()
  })
})

test.describe('product window', () => {
  test('opens from the keyboard, keeps focus inside, and returns it on Escape', async ({ page }) => {
    await mockApi(page)
    await page.goto('/#shop')
    const card = page.getByRole('button', { name: 'View Solar power package details and full image' })
    await card.focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: 'Solar power package details' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Close ×' })).toBeFocused()
    // Several presses in a row in each direction: without the trap, focus would leave the dialog.
    for (const key of ['Tab', 'Tab', 'Tab', 'Shift+Tab', 'Shift+Tab', 'Shift+Tab']) {
      await page.keyboard.press(key)
      expect(await dialog.evaluate((el) => el.contains(document.activeElement)), `focus after ${key}`).toBe(true)
    }
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(card).toBeFocused()
  })
})

test.describe('cart', () => {
  test('adds, changes, and removes products, and remembers the cart after a reload', async ({ page }) => {
    await mockApi(page)
    await page.goto('/#shop')
    await page.locator('.shop-product-card').first().getByRole('button', { name: 'Add to order' }).click()
    await page.getByRole('button', { name: 'Increase Custom control panel quantity' }).click()
    await expect(page.getByLabel('Custom control panel quantity', { exact: true })).toHaveText('2')
    await page.reload()
    await expect(page.getByLabel('Custom control panel quantity', { exact: true })).toHaveText('2')
    // Only product IDs and quantities are stored in the browser.
    expect(await page.evaluate(() => localStorage.getItem('gpec-order-cart'))).toBe('[{"id":"panel-001","quantity":2}]')
    await page.getByRole('button', { name: 'Remove Custom control panel from cart' }).click()
    await expect(page.getByText('Your cart is empty.')).toBeVisible()
  })

  test('drops saved cart items for products that are no longer listed', async ({ page }) => {
    await mockApi(page)
    await page.addInitScript(() => localStorage.setItem('gpec-order-cart', JSON.stringify([{ id: 'panel-001', quantity: 1 }, { id: 'retired-001', quantity: 3 }])))
    await page.goto('/#shop')
    await expect(page.getByLabel('Custom control panel quantity', { exact: true })).toHaveText('1')
    await expect.poll(() => page.evaluate(() => localStorage.getItem('gpec-order-cart'))).toBe('[{"id":"panel-001","quantity":1}]')
  })
})

test.describe('order enquiry', () => {
  async function fillOrder(page: import('@playwright/test').Page) {
    await page.goto('/#shop')
    await page.locator('.shop-product-card').first().getByRole('button', { name: 'Add to order' }).click()
    await page.getByRole('button', { name: 'Submit order enquiry' }).click()
    await page.getByLabel('Full name').fill('Ada Buyer')
    await page.getByLabel('Email address').fill('ada@example.com')
    await page.getByLabel('Phone number').fill('0800 000 0000')
  }

  test('sends only product IDs and quantities, then confirms and empties the cart', async ({ page }) => {
    const api = await mockApi(page)
    await fillOrder(page)
    await page.getByRole('button', { name: 'Submit enquiry' }).click()
    const confirmation = page.locator('.shop-confirmation')
    await expect(confirmation).toContainText('GPEC-2026-AAAAAAAA')
    await expect(confirmation).toBeFocused()
    const sent = api.requests.find((r) => r.path === '/api/enquiries')?.body
    expect(sent).toMatchObject({ customer: { fullName: 'Ada Buyer', email: 'ada@example.com' }, items: [{ productId: 'panel-001', quantity: 1 }], website: '' })
    expect(JSON.stringify(sent)).not.toMatch(/price|name":"Custom/)
    expect(await page.evaluate(() => localStorage.getItem('gpec-order-cart'))).toBe('[]')
  })

  test('shows a visible, focused error when sending fails, and keeps what was typed', async ({ page }) => {
    await mockApi(page, { formsFail: true })
    await fillOrder(page)
    await page.getByRole('button', { name: 'Submit enquiry' }).click()
    const error = page.locator('.shop-form-error')
    await expect(error).toHaveText('Check enquiry details and try again.')
    await expect(error).toBeFocused()
    await expect(error).toHaveCSS('color', 'rgb(6, 23, 71)')
    await expect(page.getByLabel('Full name')).toHaveValue('Ada Buyer')
  })

  test('the order page explains an empty cart', async ({ page }) => {
    await mockApi(page)
    await page.goto('/#shop/order')
    await expect(page.getByRole('heading', { name: 'Your cart is empty.' })).toBeVisible()
  })
})
