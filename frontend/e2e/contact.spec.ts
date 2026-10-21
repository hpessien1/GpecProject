import { expect, test } from '@playwright/test'
import { mockApi } from './support/sampleApi'

test.describe('contact form', () => {
  async function fillContactForm(page: import('@playwright/test').Page) {
    await page.goto('/#contact')
    const form = page.locator('.quote-form')
    await form.getByLabel('Full name').fill('Ada Buyer')
    await form.getByLabel('Email address').fill('ada@example.com')
    await form.getByLabel('What can we help with?').selectOption('Solar energy')
    await form.getByLabel('Your requirement').fill('A solar system for my shop.')
    return form
  }

  test('sends the inquiry with the spam trap empty and shows the reference', async ({ page }) => {
    const api = await mockApi(page)
    const form = await fillContactForm(page)
    await form.getByRole('button', { name: 'Send inquiry' }).click()
    const success = form.locator('.success-message')
    await expect(success).toContainText('GPEC-C-2026-AAAAAAAA')
    await expect(success).toBeFocused()
    expect(api.requests.find((r) => r.path === '/api/contact-requests')?.body).toEqual({
      fullName: 'Ada Buyer', company: '', email: 'ada@example.com', phone: '', subject: 'Solar energy', message: 'A solar system for my shop.', website: '',
    })
  })

  test('keeps what was typed and focuses the error when sending fails', async ({ page }) => {
    await mockApi(page, { formsFail: true })
    const form = await fillContactForm(page)
    await form.getByRole('button', { name: 'Send inquiry' }).click()
    await expect(form.locator('.form-error')).toBeFocused()
    await expect(form.getByLabel('Full name')).toHaveValue('Ada Buyer')
  })

  test('the spam-trap field is invisible, unreachable by keyboard, and hidden from screen readers', async ({ page }) => {
    await mockApi(page)
    await page.goto('/#contact')
    const trap = page.locator('.quote-form input[name="website"]')
    await expect(trap).toHaveAttribute('tabindex', '-1')
    await expect(trap.locator('xpath=ancestor::*[@aria-hidden="true"]')).toHaveCount(1)
    const box = await trap.boundingBox()
    expect(box === null || box.x + box.width < 0).toBe(true)
  })

  test('the privacy notice link opens in a new tab, so typed details are kept', async ({ page, context }) => {
    await mockApi(page)
    const form = await fillContactForm(page)
    const [notice] = await Promise.all([context.waitForEvent('page'), form.getByRole('link', { name: /privacy notice/ }).click()])
    await expect(notice.getByRole('heading', { name: 'Privacy notice' })).toBeVisible()
    await expect(form.getByLabel('Full name')).toHaveValue('Ada Buyer')
  })
})

test.describe('privacy notice', () => {
  test('is reachable from the footer, marked as a draft, and highlights missing details', async ({ page }) => {
    await mockApi(page)
    await page.goto('/')
    await page.getByRole('contentinfo').getByRole('link', { name: 'Privacy notice' }).click()
    await expect(page).toHaveTitle('Privacy notice | GPEC')
    await expect(page.getByRole('note')).toContainText('has not yet been approved by GPEC')
    await expect(page.locator('mark.placeholder-text').first()).toBeVisible()
  })
})
