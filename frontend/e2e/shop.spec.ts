import { expect, test } from '@playwright/test'
import { mockApi, sampleProducts, SAMPLE_BANK } from './support/sampleApi'

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

  test('filters by category, each with its own address, starting each at page 1', async ({ page }) => {
    await mockApi(page)
    await page.goto('/#shop')
    const categories = page.getByRole('navigation', { name: 'Product categories' })
    await expect(categories.getByRole('link')).toHaveText(['All 7', 'Electrical 3', 'Solar 1', 'Electronics 1', 'Industrial 1'])
    await expect(categories.getByRole('link', { name: /^All/ })).toHaveAttribute('aria-current', 'page')
    await page.getByRole('navigation', { name: 'Product catalogue pages' }).getByRole('button', { name: 'Next' }).click()
    await expect(page.getByText('Showing 7–7 of 7 products')).toBeVisible()

    await categories.getByRole('link', { name: /^Electrical/ }).click()
    await expect(page).toHaveURL(/#shop\/category\/electrical$/)
    await expect(categories.getByRole('link', { name: /^Electrical/ })).toHaveAttribute('aria-current', 'page')
    await expect(page.getByText('Electrical products', { exact: true })).toBeVisible()
    await expect(page.getByText('Showing 1–3 of 3 products')).toBeVisible()
    await expect(page.locator('.shop-product-card h2')).toHaveText(['Custom control panel', 'Panel accessories', 'Main isolator switch'])

    // A product without a category is listed only under All.
    await page.goBack()
    await expect(page).toHaveURL(/#shop$/)
    await expect(page.locator('.shop-product-card h2', { hasText: 'Terminal block set' })).toHaveCount(1)
    for (const group of ['solar', 'electronics', 'industrial']) {
      await page.goto(`/#shop/category/${group}`)
      await expect(page.locator('.shop-product-card h2', { hasText: 'Terminal block set' })).toHaveCount(0)
    }
  })

  test('says a category has nothing listed yet, and offers to source it', async ({ page }) => {
    await mockApi(page, { products: sampleProducts().filter((product) => product.category !== 'electronics') })
    await page.goto('/#shop/category/electronics')
    await expect(page.getByRole('navigation', { name: 'Product categories' }).getByRole('link', { name: /^Electronics/ })).toHaveText('Electronics 0')
    await expect(page.getByRole('heading', { name: 'No electronics products are listed yet.' })).toBeVisible()
    await expect(page.locator('.shop-category-empty').getByRole('link', { name: 'Ask GPEC' })).toHaveAttribute('href', '#contact')
    await expect(page.getByRole('navigation', { name: 'Product catalogue pages' })).toHaveCount(0)
  })

  test('an unknown category address shows the home page, not an empty shop', async ({ page }) => {
    await mockApi(page)
    await page.goto('/#shop/category/toys')
    await expect(page.locator('.hero')).toBeVisible()
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
    await page.locator('.shop-product-card').first().getByRole('button', { name: 'Add to cart' }).click()
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

test.describe('out of stock', () => {
  function withSolarOutOfStock() {
    return sampleProducts().map((product) => product.id === 'solar-001' ? { ...product, inStock: false } : product)
  }

  test('shows the product, labelled, and it cannot be added to the cart', async ({ page }) => {
    const api = await mockApi(page, { products: withSolarOutOfStock() })
    await page.goto('/#shop')
    const card = page.locator('.shop-product-card', { hasText: 'Solar power package' })
    await expect(card.locator('.shop-stock-label')).toHaveText('Out of stock')
    const button = card.getByRole('button', { name: 'Out of stock: Solar power package' })
    await expect(button).toBeDisabled()
    await expect(page.locator('.shop-product-card', { hasText: 'Custom control panel' }).locator('.shop-stock-label')).toHaveCount(0)
    await card.getByRole('button', { name: /View Solar power package/ }).click()
    await expect(page.getByRole('dialog').locator('.shop-stock-label')).toHaveText('Out of stock')
    expect(await page.evaluate(() => localStorage.getItem('gpec-order-cart'))).toBe('[]')
    expect(api.requests.every((r) => r.method === 'GET')).toBe(true)
  })

  test('a product that ran out after it was added is marked in the cart and at checkout', async ({ page }) => {
    await mockApi(page, { products: withSolarOutOfStock() })
    await page.addInitScript(() => localStorage.setItem('gpec-order-cart', JSON.stringify([{ id: 'solar-001', quantity: 1 }, { id: 'panel-001', quantity: 1 }])))
    await page.goto('/#shop')
    const line = page.locator('.shop-cart-list li', { hasText: 'Solar power package' })
    await expect(line.locator('.shop-stock-label')).toHaveText('Out of stock')
    await expect(page.getByRole('button', { name: 'Increase Solar power package quantity' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Increase Custom control panel quantity' })).toBeEnabled()
    await page.getByRole('button', { name: 'Go to checkout' }).click()
    await expect(page.locator('.shop-stock-note')).toHaveText('One product is out of stock and cannot be bought for now. Remove it from your cart in the catalogue.')
  })
})

test.describe('checkout', () => {
  test('until Paystack is set up: shows the order and says online payment is not available yet, with a way to contact GPEC', async ({ page }) => {
    const api = await mockApi(page, { paymentsOn: false, bankTransfer: { ...SAMPLE_BANK, enabled: false } })
    await page.goto('/#shop')
    await page.locator('.shop-product-card').first().getByRole('button', { name: 'Add to cart' }).click()
    await page.getByRole('button', { name: 'Go to checkout' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Review\s*your order\./)
    await expect(page.getByRole('heading', { name: 'Online payment is not available yet' })).toBeVisible()
    await expect(page.locator('.shop-order-summary')).toContainText('Custom control panel')
    // No enquiry form: nothing to fill in or send until Paystack is set up.
    await expect(page.locator('main').getByRole('textbox')).toHaveCount(0)
    await expect(page.locator('main form')).toHaveCount(0)
    expect(api.requests.some((r) => r.method !== 'GET')).toBe(false)
    expect(await page.evaluate(() => localStorage.getItem('gpec-order-cart'))).toBe('[{"id":"panel-001","quantity":1}]')
    await page.getByRole('link', { name: 'Contact GPEC' }).click()
    await expect(page.locator('#contact')).toBeInViewport()
  })

  test('the checkout page explains an empty cart', async ({ page }) => {
    await mockApi(page)
    await page.goto('/#shop/order')
    await expect(page.getByRole('heading', { name: 'Your cart is empty.' })).toBeVisible()
  })
})

test.describe('prices', () => {
  test('show on the card and in the product window, in naira, with "to be confirmed" for unpriced products', async ({ page }) => {
    await mockApi(page)
    await page.goto('/#shop')
    const priced = page.locator('.shop-product-card', { hasText: 'Custom control panel' })
    await expect(priced.locator('.shop-price')).toHaveText('₦1,500.50')
    await expect(page.locator('.shop-product-card', { hasText: 'Solar power package' }).locator('.shop-price')).toHaveText('Price to be confirmed')
    await priced.getByRole('button', { name: 'View Custom control panel details and full image' }).click()
    await expect(page.getByRole('dialog').locator('.shop-price')).toHaveText('₦1,500.50')
  })

  test('show as a price per item in the cart and at checkout, with no total worked out in the browser', async ({ page }) => {
    await mockApi(page, { paymentsOn: false, bankTransfer: { ...SAMPLE_BANK, enabled: false } })
    await page.goto('/#shop')
    await page.getByRole('button', { name: 'Add to cart: Custom control panel' }).click()
    await page.getByRole('button', { name: 'Add to cart: Custom control panel' }).click()
    await page.getByRole('button', { name: 'Add to cart: Solar power package' }).click()
    const cart = page.locator('#shop-cart')
    await expect(cart.locator('.shop-line-price')).toHaveText(['₦1,500.50 each', 'Price to be confirmed'])
    await expect(cart).not.toContainText('₦3,001')
    await page.getByRole('button', { name: 'Go to checkout' }).click()
    const summary = page.locator('.shop-order-summary')
    await expect(summary.locator('.shop-line-price')).toHaveText(['₦1,500.50 each', 'Price to be confirmed'])
    await expect(summary).not.toContainText('₦3,001')
  })

  test('are not shown while the server has no currency configured', async ({ page }) => {
    await mockApi(page, { currency: null })
    await page.goto('/#shop')
    await expect(page.locator('.shop-product-card')).toHaveCount(6)
    await expect(page.locator('.shop-price')).toHaveCount(0)
    await expect(page.getByText('Price to be confirmed')).toHaveCount(0)
  })
})
