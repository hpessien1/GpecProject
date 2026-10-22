import { expect, test } from '@playwright/test'
import { ContrastAudit, EXEMPT } from './support/contrast'
import { ADMIN, CONTACT_REF, ENQUIRY_REF, mockApi } from './support/sampleApi'

// Every page and state of the site must meet WCAG AA text contrast at phone and desktop width,
// including hover (desktop only). Run with `npm run check:contrast`. A new page or state belongs here.
// Exemptions: support/contrast.ts, EXEMPT, each with a reason.

for (const [label, width, height] of [['desktop', 1440, 900], ['phone', 390, 844]] as const) {
  test(`text contrast meets WCAG AA (${label})`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce', deviceScaleFactor: 1, baseURL: test.info().project.use.baseURL })
    const page = await context.newPage()
    const api = await mockApi(page)
    const audit = new ContrastAudit()
    const hovering = label === 'desktop'
    const open = async (hash: string, waitFor: string) => {
      await page.goto(`/${hash}`)
      await page.reload({ waitUntil: 'networkidle' })
      await page.locator(waitFor).first().waitFor()
    }

    await open('', '.hero')
    await audit.page(page, `${label} home`)
    if (hovering) await audit.hover(page, `${label} home`)
    // A photo-backed service in the featured panel, with its "Illustrative image" label.
    await page.getByRole('button', { name: 'Show Solar sales in the panel above' }).click()
    await audit.page(page, `${label} services with Solar sales featured`)
    api.formsFail = true
    const contact = page.locator('.quote-form')
    await contact.getByLabel('Full name').fill('Sample')
    await contact.getByLabel('Email address').fill('sample@example.com')
    await contact.getByLabel('Your requirement').fill('Sample')
    await contact.getByRole('button', { name: 'Send inquiry' }).click()
    await contact.locator('.form-error').waitFor()
    await audit.page(page, `${label} contact form error`)
    api.formsFail = false
    await contact.getByRole('button', { name: 'Send inquiry' }).click()
    await contact.locator('.success-message').waitFor()
    await audit.page(page, `${label} contact form sent`)

    await open('#shop', '.shop-product-card')
    await audit.page(page, `${label} shop`)
    if (hovering) await audit.hover(page, `${label} shop`)
    await page.locator('.shop-product-preview').first().click()
    await page.locator('.shop-lightbox').waitFor()
    await audit.page(page, `${label} product window`, '.shop-lightbox-content')
    await page.keyboard.press('Escape')
    await page.locator('.shop-add-button').first().click()
    await audit.page(page, `${label} shop with cart`)
    await page.locator('.shop-order-button').click()
    await page.locator('.shop-order-form').waitFor()
    await audit.page(page, `${label} order form`)
    api.formsFail = true
    await page.getByLabel('Full name').fill('Sample')
    await page.getByLabel('Email address').fill('sample@example.com')
    await page.getByLabel('Phone number').fill('0800')
    await page.getByRole('button', { name: 'Submit enquiry' }).click()
    await page.locator('.shop-form-error').waitFor()
    await audit.page(page, `${label} order error`)
    api.formsFail = false
    await page.getByRole('button', { name: 'Submit enquiry' }).click()
    await page.locator('.shop-confirmation').waitFor()
    await audit.page(page, `${label} order confirmation`)
    await open('#shop/order', '.shop-empty-order')
    await audit.page(page, `${label} empty order page`)
    api.products = 'error'
    await open('#shop', '.shop-status')
    await audit.page(page, `${label} shop load error`)
    api.products = []
    await open('#shop', '.shop-status')
    await audit.page(page, `${label} shop with no products`)

    await open('#privacy', '.privacy-page')
    await audit.page(page, `${label} privacy notice`)

    await open('#admin', '.admin-login')
    await audit.page(page, `${label} admin login`)
    await page.getByLabel('Email address').fill(ADMIN.email)
    await page.getByLabel('Password').fill('wrong')
    await page.getByRole('button', { name: 'Log in' }).click()
    await page.locator('.form-error').waitFor()
    await audit.page(page, `${label} admin login error`)
    await page.getByLabel('Password').fill(ADMIN.password)
    await page.getByRole('button', { name: 'Log in' }).click()
    await page.locator('.admin-product-list').waitFor()
    await audit.page(page, `${label} admin products`)
    if (hovering) await audit.hover(page, `${label} admin products`)
    await open('#admin/products/panel-001', '.admin-history ol')
    await audit.page(page, `${label} admin product edit`)
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
    await open('#admin/enquiries', '.admin-request-list')
    await audit.page(page, `${label} admin enquiries`)
    await page.getByRole('searchbox', { name: 'Search' }).fill('no such customer')
    await page.getByRole('button', { name: 'Search', exact: true }).click()
    await page.locator('.admin-search-row .text-link').waitFor()
    await page.locator('.shop-status').waitFor()
    await audit.page(page, `${label} admin enquiries search with no matches`)
    if (hovering) await audit.hover(page, `${label} admin enquiries search with no matches`)
    await open(`#admin/enquiries/${ENQUIRY_REF}`, '.admin-request-detail')
    await audit.page(page, `${label} admin enquiry`)
    if (hovering) await audit.hover(page, `${label} admin enquiry`)
    await page.getByLabel('Add a note').fill('Sample note')
    await page.getByRole('button', { name: 'Add note' }).click()
    await page.locator('.admin-note-form .success-message').waitFor()
    await audit.page(page, `${label} admin enquiry note added`)
    api.notesFail = true
    await page.getByLabel('Add a note').fill('Sample note')
    await page.getByRole('button', { name: 'Add note' }).click()
    await page.locator('.admin-note-form .form-error').waitFor()
    await audit.page(page, `${label} admin enquiry note error`)
    api.notesFail = false
    await open(`#admin/contact-requests/${CONTACT_REF}`, '.admin-request-detail')
    await audit.page(page, `${label} admin contact request`)
    await context.close()

    test.info().annotations.push(...EXEMPT.map((e) => ({ type: 'exempt', description: e.reason })))
    expect(audit.report(), 'Text below WCAG AA contrast (contrast found, minimum, kind, colour, text, where, states)').toEqual([])
  })
}
