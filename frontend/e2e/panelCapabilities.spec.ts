import { expect, test } from '@playwright/test'
import { panelCapabilities, panelCapabilityDetails } from '../src/data/landingContent'
import { mockApi } from './support/sampleApi'

test('each panel capability opens its own detail page and can return to the cards', async ({ page }) => {
  await mockApi(page)
  await page.goto('/#panels')

  for (const [index, [number, title, summary]] of panelCapabilities.entries()) {
    const card = page.locator('.panel-capability-card').nth(index)
    await card.getByRole('link', { name: `More details about ${title}` }).click()

    await expect(page).toHaveURL(`/#panel-capability/${number}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title)
    await expect(page.locator('.panel-capability-detail-summary')).toHaveText(summary)
    await expect(page.locator('.panel-capability-detail-body > p')).toHaveText(panelCapabilityDetails[number])

    await page.getByRole('link', { name: 'Back to electrical panels' }).click()
    await expect(page).toHaveURL(/#panels$/)
    await expect(page.locator('#panels')).toBeInViewport()
  }
})

test('the panel capabilities include Training, and no detail page shows dummy text', async ({ page }) => {
  await mockApi(page)
  await page.goto('/#panel-capability/06')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Training')
  for (const [number] of panelCapabilities) {
    await page.goto(`/#panel-capability/${number}`)
    await expect(page.locator('.panel-capability-detail-body')).not.toContainText(/perspiciatis|lorem ipsum/i)
  }
})

test('an unknown capability number opens the home page', async ({ page }) => {
  await mockApi(page)
  await page.goto('/#panel-capability/99')
  await expect(page.locator('#panels')).toBeAttached()
})
