import { expect, test } from '@playwright/test'
import { logInAsAdmin, mockApi } from './support/sampleApi'

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
  test('Services shows all twelve of GPEC\'s business areas', async ({ page }) => {
    await mockApi(page)
    await page.goto('/#services')
    await expect(page.locator('#service-feature h3')).toHaveText('Electrical panels')
    await expect(page.locator('.service-select')).toHaveText(['Solar energy', 'Electrical sales', 'Solar sales', 'Solar accessories', 'Electrical accessories', 'Electronics', 'Industrial sales', 'Industrial accessories', 'Installation & repairs', 'Generators & power', 'Security & smart home'].map((title) => `Show ${title} in the panel above`))
  })

  test('About shows GPEC\'s profile, vision, mission, and values; Current Work has no "sample" label', async ({ page }) => {
    await mockApi(page)
    await page.goto('/#about')
    await expect(page.locator('#about .about-lead')).toContainText('GPEC Engineering is an engineering service provider in Port Harcourt')
    await expect(page.locator('#about .about-body p')).toHaveCount(3)
    await expect(page.locator('#about .about-highlights:not(.about-values) strong')).toHaveText(['Our vision', 'Our mission'])
    await expect(page.getByRole('heading', { name: 'Our core values' })).toBeVisible()
    await expect(page.locator('#about .about-values strong')).toHaveText(['Quality', 'Safety', 'Integrity', 'Innovation', 'Reliability', 'Customer satisfaction'])
    await expect(page.locator('#current-work .current-work-lead')).toBeVisible()
    await expect(page.locator('.current-work-list li')).toHaveCount(3)
    await expect(page.getByText(/Sample content/)).toHaveCount(0)
  })

  test('each current-work update shows its stage and last-updated date', async ({ page }) => {
    await mockApi(page)
    await page.goto('/#current-work')
    const first = page.locator('.current-work-list li').first()
    await expect(first.locator('.current-work-status')).not.toBeEmpty()
    await expect(first.locator('time')).toHaveAttribute('datetime', /^\d{4}-\d{2}-\d{2}$/)
    await expect(first.locator('time')).toHaveText(/^\d{1,2} [A-Z][a-z]{2} \d{4}$/)
  })

  test('the workmanship cards show GPEC\'s own photos, with no "illustrative" label', async ({ page }) => {
    await mockApi(page)
    await page.goto('/#projects')
    const workmanship = page.locator('.work-card').filter({ hasText: 'Our workmanship' })
    await expect(workmanship).toHaveCount(2)
    for (const card of await workmanship.all()) {
      await expect(card).toContainText('From GPEC’s own work')
      await expect(card.locator('img')).toHaveAttribute('src', /^\/assets\/gpec-/)
    }
    await expect(page.locator('#projects').getByText(/illustrative/i)).toHaveCount(0)
  })

  test('the footer shows GPEC\'s real contact details, with working email and phone links', async ({ page }) => {
    await mockApi(page)
    await page.goto('/')
    const contact = page.locator('footer address')
    await expect(contact.getByRole('link', { name: 'gpecengineeringcompanylimited@gmail.com' })).toHaveAttribute('href', 'mailto:gpecengineeringcompanylimited@gmail.com')
    await expect(contact.getByRole('link', { name: '+234 703 197 5609' })).toHaveAttribute('href', 'tel:+2347031975609')
    await expect(contact.getByRole('link', { name: '+234 701 541 1707' })).toHaveAttribute('href', 'tel:+2347015411707')
    await expect(contact).toContainText('#19 King Slope Street, Woji, off Alcon Road, Port Harcourt, Rivers State')
    await expect(page.locator('footer')).toContainText('GPEC Engineering Company Limited')
    await expect(page.locator('footer')).not.toContainText(/example\.com|000 000|Mon–Fri/)
  })
})

test('every page shows the same GPEC logo in its header, including the admin screens', async ({ page }) => {
  await mockApi(page)
  const logoOn = async (hash: string) => {
    await page.goto(`/${hash}`)
    const logo = page.locator('header .brand-logo')
    await expect(logo).toHaveCount(1)
    await expect.poll(() => logo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
    return logo.getAttribute('src')
  }
  const homeLogo = await logoOn('')
  expect(homeLogo).toContain('gpec-engineering-logo-plinth')
  for (const hash of ['#privacy', '#shop', '#shop/order', '#admin']) expect(await logoOn(hash), hash).toBe(homeLogo)
  await logInAsAdmin(page)
  expect(await page.locator('header .brand-logo').getAttribute('src')).toBe(homeLogo)
})
