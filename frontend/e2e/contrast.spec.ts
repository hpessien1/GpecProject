import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { ContrastAudit, EXEMPT } from './support/contrast'
import { ADMIN, AREA_ID, CONTACT_REF, PAYMENT_REF, SAMPLE_CODE, SITE_SAMPLE_BANK, TRANSFER_ORDER_REF, logInAsAdmin, mockApi, sampleProducts } from './support/sampleApi'
import type { ApiState } from './support/sampleApi'

// Every page and state of the site must meet WCAG AA text contrast at phone and desktop width,
// including hover (desktop only). Run with `npm run check:contrast`. A new page or state belongs here.
// Exemptions: support/contrast.ts, EXEMPT, each with a reason.
//
// Split into parts, each with its own browser and sample API, so the parts run side by side (one long
// test per width took up to 4 minutes on CI while other workers sat idle). A part's states follow on
// from each other; keep a new state in the part whose pages it uses.

interface Part {
  page: Page
  api: ApiState
  audit: ContrastAudit
  label: string
  hovering: boolean
  open: (hash: string, waitFor: string) => Promise<void>
}

const parts: [string, (part: Part) => Promise<void>][] = [
  ['home page and contact form', async ({ page, api, audit, label, hovering, open }) => {
    await open('', '.hero')
    await audit.page(page, `${label} home`)
    if (hovering) await audit.hover(page, `${label} home`)
    // A photo-backed service in the featured panel, and the full-width last card.
    await page.getByRole('button', { name: 'Show Solar sales in the panel above' }).click()
    await audit.page(page, `${label} services with Solar sales featured`)
    await page.getByRole('button', { name: 'Show Security & smart home in the panel above' }).click()
    await audit.page(page, `${label} services with Security & smart home featured`)
    if (hovering) await audit.hover(page, `${label} services with Security & smart home featured`)
    api.formsFail = true
    const contact = page.locator('.quote-form')
    await contact.getByLabel('Full name').fill('Sample')
    await contact.getByLabel('Email address').fill('sample@example.com')
    await contact.getByLabel('Your requirement').fill('Sample')
    // Attached files, and one that is refused (the list, its Remove buttons, and the problem message).
    await contact.getByLabel('Attach photos or PDFs').setInputFiles([
      { name: 'nameplate.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(2048, 1) },
      { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('sample') },
    ])
    await contact.locator('.quote-files-problems').waitFor()
    await audit.page(page, `${label} contact form with attached files`)
    if (hovering) await audit.hover(page, `${label} contact form with attached files`)
    await contact.getByRole('button', { name: 'Send inquiry' }).click()
    await contact.locator('.form-error').waitFor()
    await audit.page(page, `${label} contact form error`)
    api.formsFail = false
    await contact.getByRole('button', { name: 'Send inquiry' }).click()
    await contact.locator('.success-message').waitFor()
    await audit.page(page, `${label} contact form sent`)
  }],
  ['shop, cart, empty and error states, privacy notice', async ({ page, api, audit, label, hovering, open }) => {
    // One product out of stock, so its label and disabled button are checked too.
    api.products = sampleProducts().map((product) => product.id === 'solar-001' ? { ...product, inStock: false } : product)
    await open('#shop', '.shop-product-card')
    await audit.page(page, `${label} shop`)
    if (hovering) await audit.hover(page, `${label} shop`)
    await page.locator('.shop-product-preview').first().click()
    await page.locator('.shop-lightbox').waitFor()
    await audit.page(page, `${label} product window`, '.shop-lightbox-content')
    await page.keyboard.press('Escape')
    // One category chosen (its filter link filled), then one with nothing listed yet.
    await open('#shop/category/electrical', '.shop-product-card')
    await audit.page(page, `${label} shop, one category`)
    if (hovering) await audit.hover(page, `${label} shop, one category`)
    const listed = api.products
    api.products = sampleProducts().filter((product) => product.category !== 'electronics')
    await open('#shop/category/electronics', '.shop-category-empty')
    await audit.page(page, `${label} shop, empty category`)
    api.products = listed
    await open('#shop', '.shop-product-card')
    await page.locator('.shop-add-button').first().click()
    await audit.page(page, `${label} shop with cart`)
    await page.evaluate(() => localStorage.setItem('gpec-order-cart', JSON.stringify([{ id: 'panel-001', quantity: 1 }, { id: 'solar-001', quantity: 1 }])))
    await open('#shop', '.shop-cart-list .shop-stock-label')
    await audit.page(page, `${label} cart with an out-of-stock product`)
    await page.locator('.shop-order-button').click()
    await page.locator('.shop-checkout-form').waitFor()
    await audit.page(page, `${label} checkout with an out-of-stock product`)
    await page.evaluate(() => localStorage.setItem('gpec-order-cart', '[]'))
    await open('#shop/order', '.shop-empty-order')
    await audit.page(page, `${label} empty checkout page`)
    api.products = 'error'
    await open('#shop', '.shop-status')
    await audit.page(page, `${label} shop load error`)
    api.products = []
    await open('#shop', '.shop-status')
    await audit.page(page, `${label} shop with no products`)

    await open('#privacy', '.policy-section')
    await audit.page(page, `${label} privacy notice`)
  }],
  ['two-step login', async ({ page, api, audit, label, hovering, open }) => {
    await logInAsAdmin(page)
    await audit.page(page, `${label} admin with the two-step login banner`)
    if (hovering) await audit.hover(page, `${label} admin with the two-step login banner`)
    api.twoFactorAvailable = { app: true, email: false }
    await open('#admin/security', '.admin-security-method')
    await audit.page(page, `${label} two-step login off, email unavailable`)
    if (hovering) await audit.hover(page, `${label} two-step login off, email unavailable`)
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.locator('.admin-qr').waitFor()
    await page.getByLabel('Password', { exact: true }).fill(ADMIN.password)
    await page.getByLabel('6-digit code from the app').fill('000000')
    await page.getByRole('button', { name: 'Turn on two-step login' }).click()
    await page.locator('.admin-field-error').waitFor()
    await audit.page(page, `${label} authenticator setup with a wrong code`)
    if (hovering) await audit.hover(page, `${label} authenticator setup with a wrong code`)
    await page.getByLabel('6-digit code from the app').fill(SAMPLE_CODE)
    await page.getByRole('button', { name: 'Turn on two-step login' }).click()
    await page.locator('.admin-recovery-codes').waitFor()
    await audit.page(page, `${label} recovery codes`)
    if (hovering) await audit.hover(page, `${label} recovery codes`)
    api.recoveryCodes = api.recoveryCodes.slice(0, 2)
    await open('#admin/security', '.admin-security-buttons')
    await audit.page(page, `${label} two-step login on, few recovery codes`)
    await page.getByRole('button', { name: 'Turn off two-step login' }).click()
    await page.getByLabel('Password', { exact: true }).fill('wrong password')
    await page.getByLabel('6-digit code from your app').fill(SAMPLE_CODE)
    await page.locator('form').getByRole('button', { name: 'Turn off two-step login' }).click()
    await page.locator('#security-password-error').waitFor()
    await audit.page(page, `${label} turning off, wrong password`)
    await page.getByRole('button', { name: 'Log out' }).click()
    await open('#admin', '#login-password')
    await page.getByLabel('Email address').fill(ADMIN.email)
    await page.getByLabel('Password', { exact: true }).fill(ADMIN.password)
    await page.getByRole('button', { name: 'Log in' }).click()
    await page.getByLabel('6-digit code').fill('000000')
    await page.getByRole('button', { name: 'Log in' }).click()
    await page.locator('.form-error').waitFor()
    await audit.page(page, `${label} login code step with a wrong code`)
    if (hovering) await audit.hover(page, `${label} login code step with a wrong code`)
  }],
  ['refunds policy, FAQ, and site content admin', async ({ page, api, audit, label, hovering, open }) => {
    await open('#refunds', '.policy-section')
    await audit.page(page, `${label} refunds policy (draft)`)
    if (hovering) await audit.hover(page, `${label} refunds policy (draft)`)
    api.contentFails = true
    await open('#refunds', '.policy-body .form-error')
    await audit.page(page, `${label} refunds policy load error`)
    await open('#faq', '.faq .form-error')
    await audit.page(page, `${label} FAQ load error`)
    api.contentFails = false
    await open('#faq', '.faq-item')
    for (const question of await page.locator('.faq-item summary').all()) await question.click()
    await audit.page(page, `${label} FAQ open (draft)`)
    if (hovering) await audit.hover(page, `${label} FAQ open (draft)`)

    await logInAsAdmin(page)
    await open('#admin/content', '.admin-content-list')
    await audit.page(page, `${label} admin site content list`)
    if (hovering) await audit.hover(page, `${label} admin site content list`)
    await open('#admin/content/faq', '.admin-content-section')
    const answer = page.getByLabel('Answer').first()
    await answer.fill('Online through Paystack, or by bank transfer.')
    await page.getByRole('checkbox').check()
    await page.getByRole('button', { name: 'Save and publish' }).click()
    await page.locator('.admin-history li').first().waitFor()
    for (const toggle of await page.locator('.admin-content-diff summary').all()) await toggle.click()
    await audit.page(page, `${label} admin FAQ saved, with history`)
    await answer.fill('Unsaved change.')
    await audit.page(page, `${label} admin FAQ with unsaved changes`)
    if (hovering) await audit.hover(page, `${label} admin FAQ with unsaved changes`)
    await open('#faq', '.faq-item')
    await audit.page(page, `${label} FAQ approved`)
  }],
  ['checkout', async ({ page, api, audit, label, hovering, open }) => {
    // A cart with a priced and an unpriced product, as a customer arriving from the shop would have.
    await open('#shop', '.shop-product-card')
    await page.evaluate(() => localStorage.setItem('gpec-order-cart', JSON.stringify([{ id: 'panel-001', quantity: 1 }, { id: 'solar-001', quantity: 1 }])))
    api.paymentsOn = false
    api.bankTransfer.enabled = false
    await open('#shop/order', '.shop-checkout-unavailable')
    await audit.page(page, `${label} checkout before payment is set up`)
    if (hovering) await audit.hover(page, `${label} checkout before payment is set up`)
    api.paymentsOn = true
    api.bankTransfer.enabled = true
    await page.evaluate(() => localStorage.setItem('gpec-order-cart', JSON.stringify([{ id: 'panel-001', quantity: 2 }])))
    await open('#shop/order', '.shop-order-totals')
    await audit.page(page, `${label} checkout, pickup`)
    if (hovering) await audit.hover(page, `${label} checkout, pickup`)
    await page.getByRole('radio', { name: /Delivery within Nigeria/ }).check()
    await page.getByLabel('Delivery area').selectOption(AREA_ID)
    await page.locator('.shop-order-totals', { hasText: 'Port Harcourt' }).waitFor()
    await audit.page(page, `${label} checkout, delivery`)
    api.paymentStartFails = true
    await page.getByLabel('Full name').fill('Sample')
    await page.getByLabel('Email address').fill('sample@example.com')
    await page.getByLabel('Phone number').fill('+234 800 000 0000')
    await page.getByLabel('Delivery address').fill('Sample address')
    await page.getByRole('button', { name: /^Pay ₦/ }).click()
    await page.locator('.shop-checkout-form .form-error').waitFor()
    await audit.page(page, `${label} checkout, payment could not start`)
    api.paymentStartFails = false
    // The price error, with a product that has no price.
    await page.evaluate(() => localStorage.setItem('gpec-order-cart', JSON.stringify([{ id: 'solar-001', quantity: 1 }])))
    api.products = sampleProducts()
    await open('#shop/order', '.shop-summary-error')
    await audit.page(page, `${label} checkout, product without a price`)
  }],
  ['payment results and bank transfer', async ({ page, api, audit, label, hovering, open }) => {
    for (const result of ['pending_payment', 'failed', 'paid'] as const) {
      api.paymentResult = result
      await open(`#shop/payment/${PAYMENT_REF}`, '#payment-result-title')
      await audit.page(page, `${label} payment result ${result}`)
      if (hovering) await audit.hover(page, `${label} payment result ${result}`)
    }
    // A bank-transfer order: the checkout choice, then its instructions before and after "I have sent it".
    await page.evaluate(() => localStorage.setItem('gpec-order-cart', JSON.stringify([{ id: 'panel-001', quantity: 2 }])))
    await open('#shop/order', '.shop-order-totals')
    await page.getByRole('radio', { name: /Bank transfer/ }).check()
    await page.getByRole('button', { name: /^Place order: / }).waitFor()
    await audit.page(page, `${label} checkout, bank transfer`)
    await page.getByLabel('Full name').fill('Sample')
    await page.getByLabel('Email address').fill('sample@example.com')
    await page.getByLabel('Phone number').fill('+234 800 000 0000')
    api.paymentResult = 'pending_payment'
    await page.getByRole('button', { name: /^Place order: / }).click()
    await page.locator('.shop-transfer-details').waitFor()
    await audit.page(page, `${label} bank transfer instructions`)
    if (hovering) await audit.hover(page, `${label} bank transfer instructions`)
    await page.getByRole('button', { name: 'I have sent the transfer' }).click()
    await page.locator('.shop-checkout-unavailable .success-message').waitFor()
    await audit.page(page, `${label} bank transfer reported`)
    api.paymentResult = 'failed'
    await page.reload({ waitUntil: 'networkidle' })
    await page.getByRole('heading', { name: 'This order was closed' }).waitFor()
    await audit.page(page, `${label} bank transfer closed`)
  }],
  ['admin login and password reset', async ({ page, audit, label, hovering, open }) => {
    await open('#admin/forgot-password', '.admin-login')
    await page.getByLabel('Email address').fill(ADMIN.email)
    await page.getByRole('button', { name: 'Email me a reset link' }).click()
    await page.locator('.success-message').waitFor()
    await audit.page(page, `${label} admin forgot password sent`)
    if (hovering) await audit.hover(page, `${label} admin forgot password sent`)
    // Not open(): its reload would find the token already removed from the address.
    await page.goto(`/#admin/reset-password/${'x'.repeat(43)}`)
    await page.locator('#newPassword').waitFor()
    await page.getByLabel('New password', { exact: true }).fill('a long enough password')
    await page.getByLabel('New password again').fill('a long enough password')
    await page.getByRole('button', { name: 'Save new password' }).click()
    await page.locator('.form-error a').waitFor()
    await audit.page(page, `${label} admin reset link expired`)
    if (hovering) await audit.hover(page, `${label} admin reset link expired`)

    await open('#admin', '.admin-login')
    await audit.page(page, `${label} admin login`)
    if (hovering) await audit.hover(page, `${label} admin login`)
    await page.getByLabel('Email address').fill(ADMIN.email)
    await page.getByLabel('Password', { exact: true }).fill('wrong')
    await page.getByRole('button', { name: 'Log in' }).click()
    await page.locator('.form-error').waitFor()
    await audit.page(page, `${label} admin login error`)
    await page.getByLabel('Password', { exact: true }).fill(ADMIN.password)
    await page.getByRole('button', { name: 'Log in' }).click()
    await page.locator('.admin-product-list').waitFor()
    await audit.page(page, `${label} admin products`)
    if (hovering) await audit.hover(page, `${label} admin products`)
  }],
  ['admin products, password, bank details, emails, delivery', async ({ page, api, audit, label, hovering, open }) => {
    await logInAsAdmin(page)
    await open('#admin/products/panel-001', '.admin-history ol')
    await audit.page(page, `${label} admin product edit`)
    api.uploadFails = true
    await page.getByLabel('Image', { exact: true }).setInputFiles({ name: 'renamed.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('not a photo') })
    await page.locator('#product-image-upload-error').waitFor()
    await audit.page(page, `${label} admin product photo refused`)
    api.uploadFails = false
    await page.getByLabel('Image', { exact: true }).setInputFiles({ name: 'panel.png', mimeType: 'image/png', buffer: readFileSync(join(process.cwd(), 'public/assets/product-lineup.png')) })
    await page.getByText('New photo, as the shop will show it.').waitFor()
    await audit.page(page, `${label} admin product photo uploaded`)
    if (hovering) await audit.hover(page, `${label} admin product photo uploaded`)
    await open('#admin/new', '#product-id')
    await page.getByRole('button', { name: 'Create product' }).click()
    await audit.page(page, `${label} admin new product`)
    await open('#admin/password', '#currentPassword')
    await page.getByLabel('Current password').fill('x')
    await page.getByLabel('New password', { exact: true }).fill('short')
    await page.getByLabel('New password again').fill('short')
    await page.getByRole('button', { name: 'Change password' }).click()
    await page.locator('.admin-field-error').first().waitFor()
    await audit.page(page, `${label} admin password errors`)
    if (hovering) await audit.hover(page, `${label} admin password errors`)
    await page.getByLabel('New password', { exact: true }).fill('a long enough password')
    await page.locator('.admin-password-count-ok').waitFor()
    await audit.page(page, `${label} admin password long enough`)
    const realBank = api.bankTransfer
    api.bankTransfer = { ...SITE_SAMPLE_BANK, instructions: '', payWithinDays: 3, enabled: false }
    await open('#admin/bank-transfer', '.admin-notice-strong')
    await audit.page(page, `${label} admin bank details, still the sample`)
    api.bankTransfer = realBank
    await open('#admin/bank-transfer', '#bank-accountNumber')
    await audit.page(page, `${label} admin bank details`)
    if (hovering) await audit.hover(page, `${label} admin bank details`)
    await page.getByLabel('Account number').fill('12345')
    await page.getByLabel('Password', { exact: true }).fill(ADMIN.password)
    await page.getByRole('button', { name: 'Save bank details' }).click()
    await page.locator('.success-message, .form-error').first().waitFor()
    await audit.page(page, `${label} admin bank details saved`)
    // The reply-to address: as it starts, then a saved change with its history entry, then a refusal
    // (field error) with email switched off (its notice).
    await open('#admin/emails', '#customer-email-replyTo')
    await audit.page(page, `${label} admin customer emails`)
    if (hovering) await audit.hover(page, `${label} admin customer emails`)
    await page.getByLabel('Reply-to address').fill('orders@example.com')
    await page.getByLabel('Password', { exact: true }).fill(ADMIN.password)
    await page.getByRole('button', { name: 'Save reply-to address' }).click()
    await page.locator('.success-message').waitFor()
    await audit.page(page, `${label} admin customer emails saved`)
    api.emailOn = false
    await open('#admin/emails', '#customer-email-replyTo')
    await page.getByLabel('Reply-to address').fill('a@b')
    await page.getByLabel('Password', { exact: true }).fill(ADMIN.password)
    await page.getByRole('button', { name: 'Save reply-to address' }).click()
    await page.locator('.admin-field-error').waitFor()
    await audit.page(page, `${label} admin customer emails refused, email off`)
    api.emailOn = true
    await open('#admin/delivery', '.admin-area-list')
    await audit.page(page, `${label} admin delivery areas`)
    if (hovering) await audit.hover(page, `${label} admin delivery areas`)
    await page.getByLabel('Area name').fill('Sample')
    await page.getByLabel('Delivery fee').fill('nonsense')
    await page.getByRole('button', { name: 'Add area' }).click()
    await page.locator('.admin-field-error').waitFor()
    await audit.page(page, `${label} admin delivery area fee error`)
    await open(`#admin/delivery/${AREA_ID}`, '.admin-history')
    await audit.page(page, `${label} admin delivery area edit`)
    if (hovering) await audit.hover(page, `${label} admin delivery area edit`)
  }],
  ['admin orders and contact requests', async ({ page, api, audit, label, hovering, open }) => {
    await logInAsAdmin(page)
    await open('#admin/orders', '.admin-order-list')
    await audit.page(page, `${label} admin orders`)
    if (hovering) await audit.hover(page, `${label} admin orders`)
    // Every stage badge: the sample orders cover four; the rest are switched in place.
    for (const stage of ['processing', 'out_for_delivery', 'cancelled', 'payment_failed']) {
      await page.locator('.admin-order-list .admin-status').first().evaluate((badge, name) => badge.setAttribute('class', `admin-status admin-status-${name}`), stage)
      await audit.page(page, `${label} admin orders, ${stage} badge`)
    }
    await open('#admin/orders/GPEC-O-2026-0000000A', '.admin-order-items')
    await audit.page(page, `${label} admin order`)
    if (hovering) await audit.hover(page, `${label} admin order`)
    // "Tell the customer by email" with its hint, then the saved change marked "Customer emailed",
    // then the note shown instead while email is off.
    await page.getByLabel('Order status').selectOption('out_for_delivery')
    await page.getByRole('checkbox', { name: 'Tell the customer by email' }).waitFor()
    await audit.page(page, `${label} admin order, telling the customer`)
    await page.getByRole('button', { name: 'Update status' }).click()
    await page.locator('.admin-history-emailed').waitFor()
    await audit.page(page, `${label} admin order, customer emailed`)
    api.emailOn = false
    await page.reload()
    await page.getByLabel('Order status').selectOption('cancelled')
    await page.getByText('Email is not set up').waitFor()
    await audit.page(page, `${label} admin order, email off`)
    api.emailOn = true
    await open('#admin/orders/GPEC-O-2026-0000000D', '.admin-notice')
    await audit.page(page, `${label} admin unpaid order`)
    await open(`#admin/orders/${TRANSFER_ORDER_REF}`, '.admin-transfer-actions')
    await audit.page(page, `${label} admin order awaiting bank transfer`)
    if (hovering) await audit.hover(page, `${label} admin order awaiting bank transfer`)
    await open('#admin/contact-requests', '.admin-request-list')
    await audit.page(page, `${label} admin contact requests`)
    await page.getByRole('searchbox', { name: 'Search' }).fill('no such customer')
    await page.getByRole('button', { name: 'Search', exact: true }).click()
    await page.locator('.admin-search-row .text-link').waitFor()
    await page.locator('.shop-status').waitFor()
    await audit.page(page, `${label} admin contact requests search with no matches`)
    if (hovering) await audit.hover(page, `${label} admin contact requests search with no matches`)
    await open(`#admin/contact-requests/${CONTACT_REF}`, '.admin-request-detail')
    await audit.page(page, `${label} admin contact request`)
    if (hovering) await audit.hover(page, `${label} admin contact request`)
    await page.getByLabel('Add a note').fill('Sample note')
    await page.getByRole('button', { name: 'Add note' }).click()
    await page.locator('.admin-note-form .success-message').waitFor()
    await audit.page(page, `${label} admin contact request note added`)
    api.notesFail = true
    await page.getByLabel('Add a note').fill('Sample note')
    await page.getByRole('button', { name: 'Add note' }).click()
    await page.locator('.admin-note-form .form-error').waitFor()
    await audit.page(page, `${label} admin contact request note error`)
    api.notesFail = false
    // One without a subject, so the detail page's other layout is checked too.
    await open('#admin/contact-requests/GPEC-C-2026-0000000C', '.admin-request-detail')
    await audit.page(page, `${label} admin contact request without subject`)
  }],
  ['admin pages and older entries', async ({ page, api, audit, label, hovering, open }) => {
    // Enough orders for many pages (first, gaps, last), and a long history and notes on one order.
    const [template] = api.orders
    api.orders = [template, ...Array.from({ length: 119 }, (_, index) => ({ ...template, reference: `GPEC-O-2026-${String(index + 1).padStart(8, '0')}` }))]
    const actor = { name: ADMIN.name, email: ADMIN.email }
    api.orderHistory[template.reference] = Array.from({ length: 11 }, (_, index) => ({ action: 'order.status' as const, actor, changes: [{ field: 'fulfilmentStatus' as const, from: 'new' as const, to: 'processing' as const }], customerEmailed: false, createdAt: new Date(Date.UTC(2026, 0, 1, 0, 11 - index)).toISOString() }))
    api.requestNotes[template.reference] = Array.from({ length: 11 }, (_, index) => ({ author: actor, text: `Sample note ${11 - index}`, createdAt: new Date(Date.UTC(2026, 0, 1, 0, 11 - index)).toISOString() }))
    await logInAsAdmin(page)
    await open('#admin/orders', '.admin-order-list')
    const pages = page.getByRole('navigation', { name: 'Order list pages' })
    // Page 6 of 12: 1 … 5 6 7 … 12, both gaps shown.
    await pages.getByRole('button', { name: 'Page 12' }).click()
    for (let step = 0; step < 6; step += 1) await pages.getByRole('button', { name: 'Previous' }).click()
    await pages.locator('[aria-current="page"]', { hasText: '6' }).waitFor()
    await audit.page(page, `${label} admin orders, page 6 of 12`)
    if (hovering) await audit.hover(page, `${label} admin orders, page 6 of 12`)
    await open(`#admin/orders/${template.reference}`, '.admin-show-older')
    await audit.page(page, `${label} admin order with older history and notes`)
    if (hovering) await audit.hover(page, `${label} admin order with older history and notes`)
    await page.getByRole('button', { name: 'Show older changes' }).click()
    await page.getByRole('button', { name: 'Show older notes' }).click()
    await page.locator('.admin-older-end').nth(1).waitFor()
    await audit.page(page, `${label} admin order, every change and note shown`)
  }],
]

for (const [label, width, height] of [['desktop', 1440, 900], ['phone', 390, 844]] as const) {
  for (const [name, run] of parts) {
    test(`text contrast meets WCAG AA: ${name} (${label})`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce', deviceScaleFactor: 1, baseURL: test.info().project.use.baseURL })
      const page = await context.newPage()
      const api = await mockApi(page)
      const audit = new ContrastAudit()
      const open = async (hash: string, waitFor: string) => {
        await page.goto(`/${hash}`)
        await page.reload({ waitUntil: 'networkidle' })
        await page.locator(waitFor).first().waitFor()
      }
      await run({ page, api, audit, label, hovering: label === 'desktop', open })
      await context.close()

      test.info().annotations.push(...EXEMPT.map((e) => ({ type: 'exempt', description: e.reason })))
      expect(audit.report(), 'Text below WCAG AA contrast (contrast found, minimum, kind, colour, text, where, states)').toEqual([])
    })
  }
}
