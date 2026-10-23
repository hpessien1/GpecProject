import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { mockApi } from './support/sampleApi'

// The Services showcase (components/ServiceShowcase.tsx): choosing a card features that business area
// in the large panel and swaps places with the area that was there; "Learn more" opens the contact
// form with that area's topic chosen.

const feature = (page: Page) => page.locator('#service-feature')
const slotTitles = (page: Page) => page.locator('.service-select').evaluateAll((buttons) => buttons.map((b) => b.textContent?.replace(/^Show | in the panel above$/g, '')))

test.describe('services showcase', () => {
  test('choosing a card features it, swaps it with the featured area, and announces it', async ({ page }) => {
    await mockApi(page)
    await page.goto('/#services')
    await page.locator('.service-mini-card', { hasText: 'Solar accessories' }).click({ position: { x: 16, y: 16 } })
    await expect(feature(page).locator('h3')).toHaveText('Solar accessories')
    await expect(feature(page)).toContainText('Mounting rails, connectors')
    await expect(feature(page).locator('img')).toHaveAttribute('alt', /.+/)
    await expect(feature(page).locator('.service-image-note')).toHaveCount(0)
    expect(await slotTitles(page)).toEqual(['Solar energy', 'Electrical sales', 'Solar sales', 'Electrical panels', 'Electrical accessories', 'Electronics', 'Industrial sales', 'Industrial accessories', 'Installation & repairs', 'Generators & power', 'Security & smart home'])
    await expect(page.locator('.service-showcase [aria-live]')).toHaveText('Showing Solar accessories')
  })

  test('every area shows a photo of GPEC\'s own work or stock, none labelled illustrative', async ({ page }) => {
    await mockApi(page)
    await page.goto('/#services')
    for (let round = 0; round < 12; round++) {
      const image = feature(page).locator('img')
      await expect(image).toHaveAttribute('alt', /.+/)
      await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true)
      await expect(feature(page).locator('.service-image-note')).toHaveCount(0)
      await page.locator('.service-select').nth(round % 11).click()
    }
  })

  test('works from the keyboard, and focus stays where it was', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'phone', 'keyboard check on desktop')
    await mockApi(page)
    await page.goto('/#services')
    const button = page.getByRole('button', { name: 'Show Electronics in the panel above' })
    await button.focus()
    await page.keyboard.press('Enter')
    await expect(feature(page).locator('h3')).toHaveText('Electronics')
    // The slot now holds the previously featured area, and keeps focus.
    await expect(page.getByRole('button', { name: 'Show Electrical panels in the panel above' })).toBeFocused()
  })

  test('"Learn more" in the panel opens the contact form with that topic chosen', async ({ page }) => {
    await mockApi(page)
    await page.goto('/#services')
    await page.getByRole('button', { name: 'Show Industrial sales in the panel above' }).click()
    await feature(page).getByRole('link', { name: 'Ask about Industrial sales' }).click()
    await expect(page.locator('#contact')).toBeInViewport()
    await expect(page.locator('select[name="subject"]')).toHaveValue('Industrial products')
  })

  test('"Learn more" on a card goes straight to the contact form without featuring it', async ({ page }) => {
    await mockApi(page)
    await page.goto('/#services')
    await page.locator('.service-mini-card', { hasText: 'Solar sales' }).getByRole('link', { name: 'Ask about Solar sales' }).click()
    await expect(page.locator('select[name="subject"]')).toHaveValue('Solar products')
    await expect(feature(page).locator('h3')).toHaveText('Electrical panels')
  })

  test('the last of the eleven cards fills its row, and its "Learn more" chooses its own topic', async ({ page }, testInfo) => {
    await mockApi(page)
    await page.goto('/#services')
    const cards = page.locator('.service-mini-card')
    await expect(cards).toHaveCount(11)
    const last = cards.last()
    await expect(last).toContainText('Security & smart home')
    if (testInfo.project.name === 'desktop') {
      const [grid, card] = await Promise.all([page.locator('.service-support-grid').boundingBox(), last.boundingBox()])
      // A normal card is half the grid; the last one spans both columns.
      expect(card?.width ?? 0).toBeGreaterThan((grid?.width ?? 0) * 0.9)
    }
    await last.getByRole('link', { name: 'Ask about Security & smart home' }).click()
    await expect(page.locator('select[name="subject"]')).toHaveValue('Security and smart home')
  })

  test('on phones, the panel scrolls into view when a card further down is chosen', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'phone layout only')
    await mockApi(page)
    await page.goto('/#services')
    const lastCard = page.locator('.service-mini-card').last()
    await lastCard.scrollIntoViewIfNeeded()
    await lastCard.click({ position: { x: 16, y: 16 } })
    await expect(feature(page)).toBeInViewport()
  })

  test('every business area\'s title fits whole in the panel', async ({ page }) => {
    await mockApi(page)
    await page.goto('/#services')
    for (let round = 0; round < 12; round++) {
      const split = await feature(page).locator('h3').evaluate((h3) => {
        const text = h3.firstChild
        if (!text) return 'no text'
        let start = 0
        for (const word of (text.textContent ?? '').split(' ')) {
          const range = document.createRange()
          range.setStart(text, start)
          range.setEnd(text, start + word.length)
          if ([...range.getClientRects()].filter((rect) => rect.width > 1).length > 1 || h3.scrollWidth > h3.clientWidth + 1) return word
          start += word.length + 1
        }
        return null
      })
      expect(split, `title word split or overflowing: ${split}`).toBeNull()
      await page.locator('.service-select').nth(round % 11).click()
    }
  })
})

test.describe('contact form topics', () => {
  test('offer one topic per business area, plus Other', async ({ page }) => {
    await mockApi(page)
    await page.goto('/#contact')
    await expect(page.locator('select[name="subject"] option:not([disabled])')).toHaveText(['Electrical panels', 'Solar energy', 'Electrical products', 'Solar products', 'Solar accessories', 'Electrical accessories', 'Electronics', 'Industrial products', 'Industrial accessories', 'Installation and repairs', 'Generators and power systems', 'Security and smart home', 'Other inquiry'])
  })

  test('a chosen topic is sent and cleared after sending', async ({ page }) => {
    const api = await mockApi(page)
    await page.goto('/#services')
    await page.locator('.service-mini-card', { hasText: 'Electronics' }).getByRole('link').click()
    const form = page.locator('.quote-form')
    await form.getByLabel('Full name').fill('Ada Buyer')
    await form.getByLabel('Email address').fill('ada@example.com')
    await form.getByLabel('Your requirement').fill('A sensor replacement.')
    await form.getByRole('button', { name: 'Send inquiry' }).click()
    await expect(form.locator('.success-message')).toBeVisible()
    expect(api.requests.find((r) => r.path === '/api/contact-requests')?.body).toMatchObject({ subject: 'Electronics' })
    await expect(page.locator('select[name="subject"]')).toHaveValue('')
  })
})
