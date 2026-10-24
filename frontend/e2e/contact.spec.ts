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

  const photo = (name: string, bytes = 2048) => ({ name, mimeType: 'image/jpeg', buffer: Buffer.alloc(bytes, 1) })

  test('files are optional: photos and PDFs can be attached, listed, removed, and are sent with the form', async ({ page }) => {
    const api = await mockApi(page)
    const form = await fillContactForm(page)
    await expect(form.getByText('Photos or drawings (optional)')).toBeVisible()
    const picker = form.getByLabel('Attach photos or PDFs')
    await picker.setInputFiles([photo('nameplate.jpg', 300 * 1024), { name: 'layout.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(2 * 1024 * 1024, 1) }])
    const list = form.getByRole('list', { name: 'Attached files' })
    await expect(list.getByRole('listitem')).toHaveText([/nameplate\.jpg\s*300 kB\s*Remove/, /layout\.pdf\s*2\.0 MB\s*Remove/])
    // Adding more keeps what was chosen before; the same file twice is listed once.
    await form.getByLabel('Add more files').setInputFiles([photo('site.jpg'), photo('nameplate.jpg', 300 * 1024)])
    await expect(list.getByRole('listitem')).toHaveCount(3)
    await list.getByRole('button', { name: 'Remove layout.pdf' }).click()
    await expect(list.getByRole('listitem')).toHaveText([/nameplate\.jpg/, /site\.jpg/])
    await expect(form.getByLabel('Add more files')).toBeFocused()

    await form.getByRole('button', { name: 'Send inquiry' }).click()
    await expect(form.locator('.success-message')).toContainText('GPEC-C-2026-AAAAAAAA')
    expect(api.requests.find((r) => r.path === '/api/contact-requests')?.body).toEqual({
      fields: { fullName: 'Ada Buyer', company: '', email: 'ada@example.com', phone: '', subject: 'Solar energy', message: 'A solar system for my shop.', website: '' },
      files: [{ field: 'files', name: 'nameplate.jpg', type: 'image/jpeg', bytes: 300 * 1024 }, { field: 'files', name: 'site.jpg', type: 'image/jpeg', bytes: 2048 }],
    })
    await expect(form.getByRole('list', { name: 'Attached files' })).toHaveCount(0)
  })

  test('says why a file cannot be attached, and attaches at most five', async ({ page }) => {
    await mockApi(page)
    const form = await fillContactForm(page)
    await form.getByLabel('Attach photos or PDFs').setInputFiles([
      { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') },
      { name: 'IMG_0001.HEIC', mimeType: 'image/heic', buffer: Buffer.alloc(10, 1) },
      { name: 'scan.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(10 * 1024 * 1024 + 1, 1) },
    ])
    const problems = form.getByRole('alert')
    await expect(problems).toContainText('“notes.txt” is not a JPEG, PNG, or WebP photo or a PDF.')
    await expect(problems).toContainText('“IMG_0001.HEIC” is in HEIC format. Choose a JPEG version')
    await expect(problems).toContainText('“scan.pdf” is 10.0 MB. Each file must be 10 MB or smaller.')
    await expect(form.getByRole('list', { name: 'Attached files' })).toHaveCount(0)

    await form.getByLabel('Attach photos or PDFs').setInputFiles(Array.from({ length: 6 }, (_, i) => photo(`photo-${i + 1}.jpg`)))
    await expect(form.getByRole('list', { name: 'Attached files' }).getByRole('listitem')).toHaveCount(5)
    await expect(form.getByRole('alert')).toHaveText('“photo-6.jpg” was not added: you can attach up to 5 files.')
  })

  test('keeps the attached files when sending fails', async ({ page }) => {
    await mockApi(page, { formsFail: true })
    const form = await fillContactForm(page)
    await form.getByLabel('Attach photos or PDFs').setInputFiles([photo('nameplate.jpg')])
    await form.getByRole('button', { name: 'Send inquiry' }).click()
    await expect(form.locator('.form-error')).toBeFocused()
    await expect(form.getByRole('list', { name: 'Attached files' })).toContainText('nameplate.jpg')
  })

  test('the attach button shows keyboard focus, and the form offers no files while storage is off', async ({ page, browserName }, testInfo) => {
    test.skip(testInfo.project.name === 'phone' || browserName !== 'chromium', 'keyboard focus, on desktop')
    await mockApi(page)
    await fillContactForm(page)
    await page.locator('.quote-form textarea').focus()
    await page.keyboard.press('Tab')
    await expect(page.locator('#contact-files')).toBeFocused()
    await expect(page.locator('.quote-files-button')).toHaveCSS('outline-style', 'solid')

    await mockApi(page, { imageUploads: false })
    await page.reload()
    await expect(page.locator('.quote-form').getByRole('button', { name: 'Send inquiry' })).toBeVisible()
    await expect(page.locator('.quote-form').getByText('Photos or drawings')).toHaveCount(0)
  })

  test('the privacy notice link opens in a new tab, so typed details are kept', async ({ page, context }) => {
    await mockApi(page)
    const form = await fillContactForm(page)
    const [notice] = await Promise.all([context.waitForEvent('page'), form.getByRole('link', { name: /privacy notice/ }).click()])
    await expect(notice).toHaveURL(/#privacy$/)
    await expect(form.getByLabel('Full name')).toHaveValue('Ada Buyer')
  })
})

test.describe('privacy notice', () => {
  test('is reachable from the footer, marked as a draft, and highlights missing details', async ({ page }) => {
    await mockApi(page)
    await page.goto('/')
    await page.getByRole('contentinfo').getByRole('link', { name: 'Privacy notice' }).click()
    await expect(page).toHaveTitle('Privacy notice | GPEC')
    await expect(page.getByRole('note')).toContainText('Draft for GPEC’s review')
    await expect(page.locator('mark.placeholder-text').first()).toBeVisible()
  })
})
