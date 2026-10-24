import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { AREA_ID, NEW_ORDER_REF, PAYMENT_REF, SAMPLE_BANK, SITE_SAMPLE_BANK, mockApi, sampleProducts } from './support/sampleApi'

// Checkout with Paystack (ECOMMERCE_REQUIREMENTS.md). The sample "Paystack" sends the customer straight
// back to the site, as if they had paid; the sample server says how the payment went.

async function openCheckout(page: Page, cart = [{ id: 'panel-001', quantity: 2 }]) {
  await page.addInitScript((entries) => { if (!sessionStorage.getItem('cart-set')) { localStorage.setItem('gpec-order-cart', JSON.stringify(entries)); sessionStorage.setItem('cart-set', '1') } }, cart)
  await page.goto('/#shop/order')
  await expect(page.getByRole('heading', { name: 'Your details' })).toBeVisible()
}

async function fillDetails(page: Page) {
  await page.getByLabel('Full name').fill('Ngozi Sample')
  await page.getByLabel('Email address').fill('ngozi@example.com')
  await page.getByLabel('Phone number').fill('+234 803 000 0000')
}

function storedCart(page: Page) {
  return page.evaluate(() => localStorage.getItem('gpec-order-cart'))
}

test.describe('checkout', () => {
  test('pickup: shows the server’s total with the fee, sends only IDs and details, and confirms after payment', async ({ page }) => {
    const api = await mockApi(page)
    await openCheckout(page)
    await expect(page.getByRole('note')).toHaveText('Test mode: this checkout uses Paystack’s test system. No real payment is taken.')
    await expect(page.getByRole('radio', { name: /Pickup from GPEC/ })).toBeChecked()
    await expect(page.getByText('#19 King Slope Street, Woji, off Alcon Road, Port Harcourt, Rivers State').first()).toBeVisible()
    await expect(page.getByLabel('Delivery address')).toHaveCount(0)
    const totals = page.locator('.shop-order-totals')
    await expect(totals).toContainText('Subtotal₦3,001.00')
    await expect(totals).toContainText('Payment processing fee₦145.02')
    await expect(totals).toContainText('Total to pay₦3,146.02')
    await expect(totals).not.toContainText('Delivery')
    expect(api.requests.find((r) => r.path === '/api/checkout/quote')?.body).toEqual({ items: [{ productId: 'panel-001', quantity: 2 }], fulfilmentMethod: 'pickup', deliveryAreaId: null, paymentMethod: 'paystack' })

    await fillDetails(page)
    await page.getByLabel('Additional requirements or notes (optional)').fill('Collect on Friday')
    await page.getByRole('button', { name: 'Pay ₦3,146.02 with Paystack' }).click()
    await expect(page.getByRole('heading', { name: 'Thank you. Your order is paid.' })).toBeVisible()
    expect(api.requests.find((r) => r.path === '/api/checkout/orders')?.body).toEqual({
      items: [{ productId: 'panel-001', quantity: 2 }], fulfilmentMethod: 'pickup', deliveryAreaId: null, paymentMethod: 'paystack',
      fullName: 'Ngozi Sample', company: '', email: 'ngozi@example.com', phone: '+234 803 000 0000', deliveryAddress: '', notes: 'Collect on Friday', website: '',
    })
    // Paystack's return address became the site's own route, without its query.
    expect(page.url()).toMatch(new RegExp(`/#shop/payment/${PAYMENT_REF}$`))
    await expect(page.getByText(`Your order reference is ${NEW_ORDER_REF}.`)).toBeVisible()
    await expect(page.locator('.shop-order-totals')).toContainText('Total paid₦3,146.02')
    await expect.poll(() => storedCart(page)).toBe('[]')
  })

  test('delivery: asks for the area and address, adds the area’s fee, and sends both', async ({ page }) => {
    const api = await mockApi(page)
    await openCheckout(page)
    await page.getByRole('radio', { name: /Delivery within Nigeria/ }).check()
    const area = page.getByLabel('Delivery area')
    await expect(area.locator('option')).toHaveText(['Choose your area', 'Port Harcourt (₦3,000.00)', 'Lagos (₦25,000.00)'])
    await expect(page.getByText('Choose your delivery area to see the delivery fee and total.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Pay with Paystack' })).toBeDisabled()
    await area.selectOption(AREA_ID)
    await expect(page.getByText('Woji, GRA, Trans-Amadi')).toBeVisible()
    await expect(page.locator('.shop-order-totals')).toContainText('DeliveryPort Harcourt₦3,000.00')
    await fillDetails(page)
    await page.getByLabel('Delivery address').fill('12 Sample Road, Woji')
    await page.getByRole('button', { name: /^Pay ₦/ }).click()
    await expect(page.getByRole('heading', { name: 'Thank you. Your order is paid.' })).toBeVisible()
    expect(api.requests.find((r) => r.path === '/api/checkout/orders')?.body).toMatchObject({ fulfilmentMethod: 'delivery', deliveryAreaId: AREA_ID, deliveryAddress: '12 Sample Road, Woji' })
  })

  test('the browser’s own checks stop a missing address or phone before anything is sent', async ({ page }) => {
    const api = await mockApi(page)
    await openCheckout(page)
    await page.getByRole('radio', { name: /Delivery within Nigeria/ }).check()
    await page.getByLabel('Delivery area').selectOption(AREA_ID)
    await page.getByLabel('Full name').fill('Ngozi Sample')
    await page.getByLabel('Email address').fill('ngozi@example.com')
    await page.getByRole('button', { name: /^Pay ₦/ }).click()
    await expect(page.getByLabel('Phone number')).toBeFocused()
    expect(api.requests.some((r) => r.path === '/api/checkout/orders')).toBe(false)
  })

  test('a pickup-only product means pickup only, and says why', async ({ page }) => {
    await mockApi(page, { products: sampleProducts().map((product) => product.id === 'panel-001' ? { ...product, deliveryAvailable: false } : product) })
    await openCheckout(page)
    await expect(page.getByRole('radio', { name: /Delivery within Nigeria/ })).toBeDisabled()
    await expect(page.getByText('GPEC does not deliver Custom control panel, so this order can only be picked up.')).toBeVisible()
    await expect(page.locator('.shop-order-summary .shop-pickup-label')).toHaveText('Pickup only')
  })

  test('with no delivery areas listed, only pickup is offered', async ({ page }) => {
    await mockApi(page, { deliveryAreas: [] })
    await openCheckout(page)
    await expect(page.getByRole('radio', { name: /Delivery within Nigeria/ })).toBeDisabled()
    await expect(page.getByText('GPEC has not listed its delivery areas yet')).toBeVisible()
  })

  test('a product without a price cannot be paid for, and the server’s reason is shown', async ({ page }) => {
    await mockApi(page)
    await openCheckout(page, [{ id: 'panel-001', quantity: 1 }, { id: 'solar-001', quantity: 1 }])
    await expect(page.locator('.shop-summary-error')).toContainText('These products have no price yet and cannot be bought online: Solar power package.')
    await expect(page.getByRole('button', { name: 'Pay with Paystack' })).toBeDisabled()
  })

  test('an out-of-stock product cannot be paid for', async ({ page }) => {
    await mockApi(page, { products: sampleProducts().map((product) => product.id === 'panel-001' ? { ...product, inStock: false } : product) })
    await openCheckout(page)
    await expect(page.locator('.shop-stock-note').first()).toContainText('out of stock and cannot be bought for now')
    await expect(page.getByRole('button', { name: 'Pay with Paystack' })).toBeDisabled()
  })

  test('when Paystack does not start the payment, says nothing was charged and keeps what was typed', async ({ page }) => {
    await mockApi(page, { paymentStartFails: true })
    await openCheckout(page)
    await fillDetails(page)
    await page.getByRole('button', { name: /^Pay ₦/ }).click()
    await expect(page.locator('.form-error')).toHaveText('The payment could not be started. Nothing was charged. Please try again in a moment.')
    await expect(page.locator('.form-error')).toBeFocused()
    await expect(page.getByLabel('Full name')).toHaveValue('Ngozi Sample')
    await expect(page.getByRole('button', { name: /^Pay ₦/ })).toBeEnabled()
  })

  test('a failed payment keeps the cart and leads back to checkout', async ({ page }) => {
    await mockApi(page, { paymentResult: 'failed' })
    await openCheckout(page)
    await fillDetails(page)
    await page.getByRole('button', { name: /^Pay ₦/ }).click()
    await expect(page.getByRole('heading', { name: 'The payment did not go through' })).toBeVisible()
    expect(await storedCart(page)).toBe('[{"id":"panel-001","quantity":2}]')
    await page.getByRole('button', { name: 'Return to checkout' }).click()
    await expect(page.getByRole('heading', { name: 'Your details' })).toBeVisible()
  })

  test('a payment not yet confirmed waits, keeps the cart, and can be checked again', async ({ page }) => {
    const api = await mockApi(page, { paymentResult: 'pending_payment' })
    await page.goto(`/shop/payment-complete?trxref=${PAYMENT_REF}&reference=${PAYMENT_REF}`)
    await expect(page.getByRole('heading', { name: 'Waiting for confirmation' })).toBeVisible()
    api.paymentResult = 'paid'
    await page.getByRole('button', { name: 'Check again' }).click()
    await expect(page.getByRole('heading', { name: 'Thank you. Your order is paid.' })).toBeVisible()
  })

  test('a return address without a valid reference goes to the shop', async ({ page }) => {
    await mockApi(page)
    await page.goto('/shop/payment-complete?reference=not-a-reference')
    await expect(page).toHaveURL(/\/#shop$/)
    await expect(page.locator('.shop-product-card').first()).toBeVisible()
  })

  test('bank transfer: no processing fee, places the order, shows GPEC’s Nigerian account details, and empties the cart', async ({ page }) => {
    const api = await mockApi(page, { paymentResult: 'pending_payment' })
    await openCheckout(page)
    await page.getByRole('radio', { name: /Bank transfer/ }).check()
    await expect(page.getByRole('note')).toHaveCount(0)
    const totals = page.locator('.shop-order-totals')
    await expect(totals).toContainText('Total to pay₦3,001.00')
    await expect(totals).not.toContainText('Payment processing fee')
    expect(api.requests.filter((r) => r.path === '/api/checkout/quote').at(-1)?.body).toMatchObject({ paymentMethod: 'bank_transfer' })
    await fillDetails(page)
    await page.getByRole('button', { name: 'Place order: ₦3,001.00 by bank transfer' }).click()
    await expect(page.getByRole('heading', { name: 'Order placed: now pay by bank transfer' })).toBeVisible()
    expect(api.requests.find((r) => r.path === '/api/checkout/orders')?.body).toMatchObject({ paymentMethod: 'bank_transfer' })
    const details = page.locator('.shop-transfer-details')
    await expect(details).toContainText(`Bank${SAMPLE_BANK.bankName}`)
    await expect(details).toContainText(`Account name${SAMPLE_BANK.accountName}`)
    await expect(details).toContainText(`Account number${SAMPLE_BANK.accountNumber}`)
    await expect(details).toContainText('Amount₦3,001.00')
    await expect(details).toContainText(`Narration${NEW_ORDER_REF}`)
    await expect(page.getByText(SAMPLE_BANK.instructions)).toBeVisible()
    await expect.poll(() => storedCart(page)).toBe('[]')

    await page.getByRole('button', { name: 'I have sent the transfer' }).click()
    await expect(page.getByText('Thank you for letting GPEC know.')).toBeFocused()
    expect(api.requests.some((r) => r.path === `/api/checkout/orders/${PAYMENT_REF}/transfer-sent`)).toBe(true)
    await expect(page.getByRole('button', { name: 'I have sent the transfer' })).toHaveCount(0)
  })

  test('with only bank transfer open, it is the one way to pay', async ({ page }) => {
    await mockApi(page, { paymentsOn: false })
    await openCheckout(page)
    await expect(page.getByRole('radio', { name: /Pay online with Paystack/ })).toHaveCount(0)
    await expect(page.getByRole('radio', { name: /Bank transfer/ })).toBeChecked()
    await expect(page.getByRole('button', { name: /^Place order: / })).toBeVisible()
  })

  test('a transfer GPEC closed as not received says so and points to the contact form', async ({ page }) => {
    await mockApi(page, { paymentResult: 'failed' })
    await openCheckout(page)
    await page.getByRole('radio', { name: /Bank transfer/ }).check()
    await fillDetails(page)
    await page.getByRole('button', { name: /^Place order: / }).click()
    await expect(page.getByRole('heading', { name: 'This order was closed' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Contact GPEC' })).toBeVisible()
  })

  test('with GPEC’s sample bank details, checkout says plainly not to send money', async ({ page }) => {
    await mockApi(page, { bankTransfer: { ...SITE_SAMPLE_BANK, instructions: '', payWithinDays: 3, enabled: true } })
    await openCheckout(page)
    await page.getByRole('radio', { name: /Bank transfer/ }).check()
    await expect(page.getByText('Sample bank details for testing: do not send money.')).toBeVisible()
  })
})

test.describe('checkout policies', () => {
  test('links to the privacy notice and the refunds policy, each in a new tab', async ({ page }) => {
    await mockApi(page)
    await openCheckout(page)
    for (const [name, href] of [[/privacy notice/, '#privacy'], [/refunds, cancellations, and returns policy/, '#refunds']] as const) {
      const link = page.getByRole('link', { name })
      await expect(link).toHaveAttribute('href', href)
      await expect(link).toHaveAttribute('target', '_blank')
    }
  })
})
