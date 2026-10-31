import { expect, test } from '@playwright/test'
import { panelCapabilities, panelCapabilityDetailCopy } from '../src/data/landingContent'
import { mockApi } from './support/sampleApi'

test('each panel capability opens its matching detail page and can return to the cards', async ({ page }) => {
  await mockApi(page)
  await page.goto('/#panels')

  for (const [index, [number, title, summary]] of panelCapabilities.entries()) {
    const card = page.locator('.panel-capability-card').nth(index)
    const detailsLink = card.getByRole('link', { name: `More details about ${title}` })
    await expect(detailsLink).toHaveText('More details ↗')
    await detailsLink.click()

    await expect(page).toHaveURL(`/#panel-capability/${number}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title)
    await expect(page.locator('.panel-capability-detail-summary')).toHaveText(summary)
    await expect(page.locator('.panel-capability-detail-body > p')).toHaveText(panelCapabilityDetailCopy)

    await page.getByRole('link', { name: 'Back to electrical panels' }).click()
    await expect(page).toHaveURL(/#panels$/)
    await expect(page.locator('#panels')).toBeInViewport()
  }
})
