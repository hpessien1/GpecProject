import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { UPLOADED_IMAGE, logInAsAdmin, mockApi, sampleProducts } from './support/sampleApi'

// The production Content-Security-Policy (nginx/security-headers.conf, filled in as the Dockerfile
// does) applied to the test build, which `vite preview` serves without it. A policy mistake would
// otherwise only show up in production, as blocked API calls or missing photos.
// The test build is compiled with VITE_API_BASE_URL, or apiClient's default when it is unset.
const apiOrigin = new URL(process.env.VITE_API_BASE_URL || 'http://localhost:5001/api').origin
const policy = /Content-Security-Policy "([^"]+)"/.exec(readFileSync(join(process.cwd(), 'nginx/security-headers.conf'), 'utf8'))?.[1]
  ?.replaceAll('__API_ORIGIN__', apiOrigin)

test.beforeEach(async ({ page }) => {
  expect(policy, 'policy found in nginx/security-headers.conf').toBeTruthy()
  expect(policy).not.toContain('__API_ORIGIN__')
  await page.route('**/*', async (route) => {
    if (route.request().resourceType() !== 'document') return route.fallback()
    const response = await route.fetch()
    return route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': policy ?? '' } })
  })
})

// Violations are reported to the page as events; collect them for the test to check.
async function watchViolations(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    const seen: string[] = []
    Object.assign(window, { cspViolations: seen })
    document.addEventListener('securitypolicyviolation', (event) => seen.push(`${event.effectiveDirective} ${event.blockedURI}`))
  })
  return () => page.evaluate(() => (window as unknown as { cspViolations: string[] }).cspViolations)
}

test('the shop loads products from the API and shows an uploaded photo under the production policy', async ({ page }) => {
  const products = sampleProducts()
  products[0].image = UPLOADED_IMAGE
  await mockApi(page, { products })
  const violations = await watchViolations(page)
  const apiRequest = page.waitForRequest((request) => request.url().startsWith(`${apiOrigin}/api/products`))
  await page.goto('/#shop')
  await apiRequest
  const photo = page.locator('.shop-product-card img').first()
  await expect(photo).toHaveAttribute('src', `${apiOrigin}/api/${UPLOADED_IMAGE}`)
  await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
  expect(await violations()).toEqual([])
})

test('the admin form previews a chosen photo and the uploaded one under the production policy', async ({ page }) => {
  await mockApi(page)
  const violations = await watchViolations(page)
  let release = () => {}
  const held = new Promise<void>((resolve) => { release = resolve })
  await page.route('**/api/admin/product-images', async (route) => { await held; return route.fallback() })
  await logInAsAdmin(page)
  await page.goto('/#admin/products/panel-001')
  const preview = page.locator('.admin-image-preview img')
  await page.getByLabel('Image', { exact: true }).setInputFiles({ name: 'panel.jpg', mimeType: 'image/jpeg', buffer: readFileSync(join(process.cwd(), 'public/assets/portfolio-solar-array.jpg')) })
  await expect(preview).toHaveAttribute('src', /^blob:/)
  await expect.poll(() => preview.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
  release()
  await expect(preview).toHaveAttribute('src', `${apiOrigin}/api/${UPLOADED_IMAGE}`)
  await expect.poll(() => preview.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
  expect(await violations()).toEqual([])
})
