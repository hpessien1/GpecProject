import { expect, test } from '@playwright/test'
import { logInAsAdmin, mockApi } from './support/sampleApi'

// The brief's menu (README.md): Home · About · Services · Products · Projects · FAQ · Contact, plus the
// Shop button (Current Work was removed on 2026-10-24, FAQ added on 2026-10-25). Full menu on desktop;
// a hamburger menu where it does not fit (1100px and below).
const MENU = ['Home', 'About', 'Services', 'Products', 'Projects', 'FAQ', 'Contact', 'Shop']

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
    for (const [label, id] of [['About', 'about'], ['Services', 'services'], ['Projects', 'projects'], ['FAQ', 'faq'], ['Contact', 'contact']]) {
      if (testInfo.project.name === 'phone') await page.getByRole('button', { name: 'Menu' }).click()
      await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: label, exact: true }).click()
      await expect(page).toHaveURL(new RegExp(`#${id}$`))
      await expect(page.locator(`#${id}`)).toBeInViewport()
      if (testInfo.project.name === 'phone') await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeHidden()
    }
  })

  test('the open hamburger menu covers the page below the header, and keyboard users can leave it', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'the hamburger menu is shown at 1100px and below')
    await mockApi(page)
    await page.goto('/')
    const menu = page.getByRole('navigation', { name: 'Main navigation' })
    // In the hero's navy, a shorter menu let the hero's text show beneath it as if it were part of the menu.
    await page.getByRole('button', { name: 'Menu' }).click()
    expect(await menu.evaluate((nav) => Math.round(nav.getBoundingClientRect().bottom))).toBe(page.viewportSize()!.height)
    await page.mouse.move(200, 600)
    await page.mouse.wheel(0, 600)
    // Wheel scrolling happens after the event, so give it the time it would take to show.
    await page.waitForTimeout(500)
    expect(await page.evaluate(() => window.scrollY), 'the page behind the menu stays still').toBe(0)

    // Escape closes it and returns focus to the Menu button.
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
    await expect(page.getByRole('button', { name: 'Menu' })).toBeFocused()

    // Tabbing past the last item closes it, rather than focusing links hidden behind it.
    await page.keyboard.press('Enter')
    await menu.getByRole('link', { name: /^Shop/ }).focus()
    await page.keyboard.press('Tab')
    await expect(menu).toBeHidden()
    await page.mouse.wheel(0, 600)
    await expect.poll(() => page.evaluate(() => window.scrollY), 'the page scrolls again once the menu is closed').toBeGreaterThan(0)

    // On a phone held sideways the menu is taller than the screen and scrolls to its last item.
    await page.setViewportSize({ width: 740, height: 360 })
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.getByRole('button', { name: 'Menu' }).click()
    const shop = menu.getByRole('link', { name: /^Shop/ })
    await expect(shop).not.toBeInViewport({ ratio: 1 })
    await page.mouse.move(370, 250)
    await page.mouse.wheel(0, 400)
    await expect(shop).toBeInViewport({ ratio: 1 })
  })

  test('section links from another page land on that section of the home page', async ({ page }, testInfo) => {
    await mockApi(page)
    await page.goto('/#privacy')
    await page.getByRole('heading', { name: 'Privacy notice' }).waitFor()
    if (testInfo.project.name === 'phone') await page.getByRole('button', { name: 'Menu' }).click()
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Projects', exact: true }).click()
    await expect(page.locator('#projects')).toBeInViewport()
  })

  test('each section the menu leads to is labelled with the menu\'s word, and the panels follow Services', async ({ page }) => {
    await mockApi(page)
    await page.goto('/')
    for (const [label, id] of [['About', 'about'], ['Services', 'services'], ['Products', 'products'], ['Projects', 'projects'], ['FAQ', 'faq'], ['Contact', 'contact']]) {
      await expect(page.locator(`#${id} .eyebrow`).first(), `#${id}`).toHaveText(label)
    }
    // The panels are one of GPEC's services, so "Services" leads into them rather than past them.
    expect(await page.locator('main > section[id]').evaluateAll((sections) => sections.map((section) => section.id))).toEqual(['home', 'about', 'services', 'panels', 'products', 'projects', 'faq', 'contact'])
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

  test('About shows GPEC\'s profile, vision, mission, and values', async ({ page }) => {
    await mockApi(page)
    await page.goto('/#about')
    await expect(page.locator('#about .about-lead')).toContainText('GPEC Engineering is an engineering service provider in Port Harcourt')
    await expect(page.locator('#about .about-body p')).toHaveCount(3)
    await expect(page.locator('#about .about-highlights:not(.about-values) strong')).toHaveText(['Our vision', 'Our mission'])
    await expect(page.getByRole('heading', { name: 'Our core values' })).toBeVisible()
    await expect(page.locator('#about .about-values strong')).toHaveText(['Quality', 'Safety', 'Integrity', 'Innovation', 'Reliability', 'Customer satisfaction'])
  })

  test('there is no Current Work section; an old link to it opens the home page', async ({ page }) => {
    await mockApi(page)
    await page.goto('/#current-work')
    await expect(page.locator('#home')).toBeVisible()
    await expect(page.locator('#current-work')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Work in progress.' })).toHaveCount(0)
  })

  test('the four product cards open the shop on their category, each over one of GPEC\'s own photos', async ({ page }) => {
    await mockApi(page)
    await page.goto('/#products')
    const cards = page.getByRole('navigation', { name: 'Product categories' }).getByRole('link')
    await expect(cards).toHaveCount(4)
    for (const [index, group] of ['electrical', 'solar', 'electronics', 'industrial'].entries()) {
      await expect(cards.nth(index)).toHaveAttribute('href', `#shop/category/${group}`)
      await expect(cards.nth(index).locator('img')).toHaveAttribute('src', /^\/assets\/gpec-/)
      await expect.poll(() => cards.nth(index).locator('img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
    }
    await expect(page.locator('#products').getByRole('link', { name: 'Send us the part number or specification' })).toHaveAttribute('href', '#contact')
    await page.getByRole('link', { name: 'Shop solar products' }).click()
    await expect(page).toHaveURL(/#shop\/category\/solar$/)
    await expect(page.locator('.shop-product-card h2')).toHaveText(['Solar power package'])
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

  test('the project clips keep clear space below and beside them, also after scrolling on phones', async ({ page }, testInfo) => {
    await mockApi(page)
    await page.goto('/#projects')
    const gallery = page.locator('.work-video-gallery')
    // Space between the visible box's edges (the gallery can be taller than the box that clips it)
    // and the nearest clip that is mostly in view, in pixels.
    const space = () => gallery.evaluate((box) => {
      const outer = box.closest('.work-video-image')!.getBoundingClientRect()
      const clips = [...box.querySelectorAll('video')].map((clip) => clip.getBoundingClientRect()).filter((clip) => clip.left + clip.width / 2 > outer.left && clip.left + clip.width / 2 < outer.right)
      return { bottom: Math.round(outer.bottom - Math.max(...clips.map((clip) => clip.bottom))), left: Math.round(Math.min(...clips.map((clip) => clip.left)) - outer.left) }
    })
    expect(await space()).toEqual({ bottom: expect.any(Number), left: expect.any(Number) })
    expect((await space()).bottom).toBeGreaterThanOrEqual(24)
    expect((await space()).left).toBeGreaterThanOrEqual(20)
    if (testInfo.project.name === 'desktop') {
      // On wide screens the portrait clips once grew taller than their box and were cut off at the bottom.
      for (const width of [1920, 2560]) {
        await page.setViewportSize({ width, height: 900 })
        expect((await space()).bottom, `space below the clips at ${width}px`).toBeGreaterThanOrEqual(24)
      }
    }
    if (testInfo.project.name === 'phone') {
      await gallery.evaluate((box) => box.scrollBy({ left: 200, behavior: 'instant' }))
      await expect.poll(async () => (await space()).left).toBeGreaterThanOrEqual(20)
    }
  })

  test('each typical component\'s name stays inside its own column, at every width', async ({ page }) => {
    await mockApi(page)
    await page.goto('/#services')
    // At 0.8rem, ten names in one row ran into each other on desktop ("Programmable" over "Meters").
    const spilling = () => page.locator('.component-chip').evaluateAll((chips) => chips.filter((chip) => {
      const box = chip.getBoundingClientRect()
      const text = document.createRange()
      text.selectNodeContents(chip.querySelector('small')!)
      return [...text.getClientRects()].some((line) => line.left < box.left - 0.5 || line.right > box.right + 0.5)
    }).map((chip) => chip.textContent))
    for (const width of [1600, 1440, 1280, 1101, 900, 821, 541, 390, 320]) {
      await page.setViewportSize({ width, height: 900 })
      expect(await spilling(), `names spilling at ${width}px`).toEqual([])
    }
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
