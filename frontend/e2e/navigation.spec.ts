import { expect, test } from '@playwright/test'
import { mockApi } from './support/sampleApi'

// The brief's menu (README.md): Home · About · Services · Products · Projects · Current Work · Contact,
// plus the Shop button. Full menu on desktop; a hamburger menu where it does not fit (1100px and below).
const MENU = ['Home', 'About', 'Services', 'Products', 'Projects', 'Current Work', 'Contact', 'Shop']

test.describe('main menu', () => {
  test('shows the brief\'s items in order, as a full menu on desktop or behind the hamburger on phones', async ({ page }, testInfo) => {
    await mockApi(page)
    await page.goto('/')
    const hamburger = page.getByRole('button', { name: 'Menu' })
    const menu = page.getByRole('navigation', { name: 'Main navigation' })
    if (testInfo.project.name === 'phone') {
      await expect(menu).toBeHidden()
      await expect(hamburger).toHaveAttribute('aria-expanded', 'false')
      await hamburger.click()
      await expect(page.getByRole('button', { name: 'Close' })).toHaveAttribute('aria-expanded', 'true')
    } else {
      await expect(hamburger).toBeHidden()
    }
    await expect(menu.getByRole('link')).toHaveText(MENU.map((label) => new RegExp(`^${label}`)))
  })

  test('each menu link goes to its section, and the hamburger menu closes after choosing', async ({ page }, testInfo) => {
    await mockApi(page)
    await page.goto('/')
    for (const [label, id] of [['About', 'about'], ['Projects', 'projects'], ['Current Work', 'current-work'], ['Contact', 'contact']]) {
      if (testInfo.project.name === 'phone') await page.getByRole('button', { name: 'Menu' }).click()
      await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: label, exact: true }).click()
      await expect(page).toHaveURL(new RegExp(`#${id}$`))
      await expect(page.locator(`#${id}`)).toBeInViewport()
      if (testInfo.project.name === 'phone') await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeHidden()
    }
  })

  test('section links from another page land on that section of the home page', async ({ page }, testInfo) => {
    await mockApi(page)
    await page.goto('/#privacy')
    await page.getByRole('heading', { name: 'Privacy notice' }).waitFor()
    if (testInfo.project.name === 'phone') await page.getByRole('button', { name: 'Menu' }).click()
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Current Work', exact: true }).click()
    await expect(page.locator('#current-work')).toBeInViewport()
  })

  test('the page never scrolls sideways, from tablet down to the smallest phones', async ({ page }) => {
    await mockApi(page)
    for (const width of [1100, 900, 821, 700, 600, 541, 390, 320]) {
      await page.setViewportSize({ width, height: 800 })
      await page.goto('/')
      await page.locator('#contact').waitFor()
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `sideways scroll at ${width}px`).toBe(0)
    }
  })
})

test.describe('home page sections', () => {
  test('About and Current Work show GPEC\'s missing details as highlighted placeholders', async ({ page }) => {
    await mockApi(page)
    await page.goto('/#about')
    await expect(page.locator('#about mark.placeholder-text').first()).toBeVisible()
    await expect(page.locator('#current-work')).toContainText('No current work has been published yet.')
    await expect(page.locator('#current-work mark.placeholder-text')).toBeVisible()
  })
})
