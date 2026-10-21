// Text contrast audit (WCAG AA) for every page and state of the site, at phone and desktop width.
//
//   npm run dev                  (in another terminal: the site on http://localhost:5173)
//   npm run check:contrast       (exits with code 1 if any text fails)
//
// Plain JavaScript run directly by Node: it is a development tool, not part of the site.
//
// Three checks:
//   1. axe-core's colour-contrast rule (the standard automated checker).
//   2. A pixel check that measures each piece of text against what is really behind it (photos,
//      gradients, overlays), which axe cannot judge: scroll through the page one screen at a time,
//      record the text fully on screen (and not covered, e.g. by the sticky header), hide all text,
//      screenshot that screen, and compare. Each element is judged by its worst 5% of background.
//      (Full-page screenshots are not used: they resize the window, which changes the height of
//      window-sized sections and shifts everything below them.)
//   3. The same pixel check with each link, button, and card hovered.
// Thresholds: 4.5:1 for normal text, 3:1 for large text (24px+, or 18.66px+ bold).
//
// Every API call is answered with sample data inside the browser, so neither the API nor the database
// is needed, nothing is written anywhere, and no admin account is used.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { chromium } from 'playwright'

const SITE = process.env.SITE_URL ?? 'http://localhost:5173'
const AXE_SOURCE = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8')
const WIDTHS = [[1440, 900], [390, 844]]

// Text WCAG does not cover. Each entry needs a reason.
const EXEMPT = [
  { where: 'span.panel-label', reason: 'Part of the decorative hero illustration (inside role="img"); WCAG exempts text in pictures.' },
]

// ── Sample data for the API ─────────────────────────────────────────────────────────────────────

const now = new Date().toISOString()
const product = (id, name, reference, image) => ({ id, name, reference, description: `${name} description for the contrast check.`, specs: ['Spec one', 'Spec two'], image, alt: name, isPlaceholder: true })
const products = [
  product('panel-001', 'Custom control panel', 'GPEC-CP-001', '/assets/electrical-panels-product.png'),
  product('solar-001', 'Solar power package', 'GPEC-SOL-020', '/assets/portfolio-solar-array.jpg'),
  product('components-001', 'Industrial electrical components', 'GPEC-IEC-033', '/assets/portfolio-electrical-components-poster.jpg'),
  product('accessories-001', 'Panel accessories', 'GPEC-PA-042', '/assets/product-lineup.png'),
  product('metering-001', 'Power metering kit', 'GPEC-PMK-051', '/assets/control-panel-annotated-clean.png'),
  product('isolation-001', 'Main isolator switch', 'GPEC-MIS-062', '/assets/electrical-panels-product.png'),
  product('terminal-001', 'Terminal block set', 'GPEC-TB-074', '/assets/product-lineup.png'),
]
const adminProduct = (p, index) => ({ ...p, price: index === 0 ? 150050 : null, status: index === 1 ? 'archived' : 'active', sortOrder: (index + 1) * 10, updatedAt: now })
const session = { admin: { name: 'Sample Admin', email: 'admin@example.com' }, currency: { code: 'NGN', minorUnitDigits: 2 } }
const customer = { fullName: 'Sample Customer', company: 'Sample Company Ltd', email: 'customer@example.com', phone: '+234 800 000 0000' }
const summary = (reference, status, text) => ({ reference, status, createdAt: now, name: customer.fullName, company: customer.company, email: customer.email, summary: text })
const counts = { new: 1, in_progress: 1, closed: 1 }
const statusHistory = [{ actor: { name: 'Sample Admin', email: 'admin@example.com' }, changes: [{ field: 'status', from: 'new', to: 'in_progress' }], createdAt: now }]
const enquiryRef = 'GPEC-2026-0000000A'
const contactRef = 'GPEC-C-2026-0000000A'

function apiResponse(method, path, state) {
  if (path === '/api/products') return [200, { products }]
  if (path === '/api/contact-requests') return state.formsFail ? [400, { message: 'Check your details and try again.' }] : [201, { reference: 'GPEC-C-2026-AAAAAAAA', createdAt: now }]
  if (path === '/api/enquiries') return state.formsFail ? [400, { message: 'Check enquiry details and try again.' }] : [201, { reference: 'GPEC-2026-AAAAAAAA', createdAt: now }]
  if (path === '/api/admin/session' && method === 'POST') {
    if (state.loginFails) return [401, { message: 'Email or password is incorrect.', code: 'INVALID_CREDENTIALS' }]
    state.loggedIn = true
    return [200, session]
  }
  if (path === '/api/admin/session' && method === 'DELETE') { state.loggedIn = false; return [204, null] }
  if (!state.loggedIn) return [401, { message: 'Please log in to continue.', code: 'ADMIN_AUTH_REQUIRED' }]
  if (path === '/api/admin/session') return [200, session]
  if (path === '/api/admin/products') return [200, { products: products.map(adminProduct), page: 1, totalPages: 2, total: 60 }]
  if (path === '/api/admin/products/panel-001') return [200, { product: adminProduct(products[0], 0) }]
  if (path === '/api/admin/products/panel-001/history') return [200, { history: [{ action: 'product.update', actor: session.admin, changes: [{ field: 'price', from: 100000, to: 150050 }, { field: 'status', from: 'archived', to: 'active' }], createdAt: now }] }]
  if (path === '/api/admin/enquiries') return [200, { items: [summary(enquiryRef, 'new', '2 × Custom control panel'), summary('GPEC-2026-0000000B', 'in_progress', '1 × Solar power package'), summary('GPEC-2026-0000000C', 'closed', '5 × Terminal block set')], page: 1, totalPages: 1, total: 3, counts }]
  if (path === `/api/admin/enquiries/${enquiryRef}`) return [200, { item: { reference: enquiryRef, status: 'in_progress', createdAt: now, updatedAt: now, customer, location: 'Lagos', notes: 'First line.\nSecond line.', items: [{ productId: 'panel-001', name: 'Custom control panel', reference: 'GPEC-CP-001', quantity: 2 }] }, history: statusHistory }]
  if (path === '/api/admin/contact-requests') return [200, { items: [summary(contactRef, 'new', 'Solar energy: Please call me.')], page: 1, totalPages: 1, total: 1, counts }]
  if (path === `/api/admin/contact-requests/${contactRef}`) return [200, { item: { reference: contactRef, status: 'new', createdAt: now, updatedAt: now, customer, subject: 'Solar energy', message: 'Please call me about a solar system.' }, history: [] }]
  return [404, { message: 'Route not found.' }]
}

async function mockApi(context, state) {
  await context.route('**/api/**', async (route) => {
    const request = route.request()
    const cors = { 'access-control-allow-origin': SITE, 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'Content-Type', 'access-control-allow-methods': 'GET, POST, PATCH, DELETE' }
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    const [status, body] = apiResponse(request.method(), new URL(request.url()).pathname, state)
    return route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: body === null ? '' : JSON.stringify(body) })
  })
}

// ── Measuring ───────────────────────────────────────────────────────────────────────────────────

// Runs in the page: every visible text box (and input placeholder/value) under root, with colour,
// effective opacity, size, and position relative to the screenshot that will be taken. Text clipped
// by a scrolling container is skipped, as is fully transparent text (shown only on hover; covered by
// the hover pass). With onScreenOnly, only text fully on screen, not covered by another element, and
// not already measured at an earlier scroll position is returned.
function collectText({ rootSelector, relativeToRoot, onScreenOnly }) {
  const root = rootSelector ? document.querySelector(rootSelector) : document.body
  const base = relativeToRoot ? root.getBoundingClientRect() : { x: 0, y: 0 }
  window.__contrastSeen ??= new WeakSet()
  const seen = window.__contrastSeen
  const onScreen = (el, r) => {
    if (!onScreenOnly) return true
    if (r.top < 0 || r.bottom > innerHeight || r.left < 0 || r.right > innerWidth) return false
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    return !!hit && (el.contains(hit) || hit.contains(el))
  }
  const parse = (c) => { const m = c.match(/[\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m[3] ?? 1 } }
  const opacityOf = (el) => { let o = 1; for (let e = el; e; e = e.parentElement) o *= Number(getComputedStyle(e).opacity); return o }
  const describe = (el) => {
    const parts = []
    for (let e = el; e && e !== document.body && parts.length < 3; e = e.parentElement) parts.unshift(e.tagName.toLowerCase() + (e.classList.length ? '.' + [...e.classList].join('.') : ''))
    return parts.join(' > ')
  }
  // False when a scrolling or clipping container hides the text (in either direction).
  const visibleIn = (el, r) => {
    for (let e = el.parentElement; e && e !== document.documentElement; e = e.parentElement) {
      const style = getComputedStyle(e)
      const c = e.getBoundingClientRect()
      if (/(auto|scroll|hidden)/.test(style.overflowY) && (r.top < c.top - 1 || r.bottom > c.bottom + 1)) return false
      if (/(auto|scroll|hidden)/.test(style.overflowX) && (r.left < c.left - 1 || r.right > c.right + 1)) return false
    }
    return r.bottom > -innerHeight * 50 && r.right > 0
  }
  // Text boxes can be taller than a small button; keep them inside the element's own borders, so a
  // border line is not mistaken for the background.
  const insideBorders = (el, r) => {
    const box = el.getBoundingClientRect()
    const style = getComputedStyle(el)
    const left = Math.max(r.left, box.left + parseFloat(style.borderLeftWidth)), right = Math.min(r.right, box.right - parseFloat(style.borderRightWidth))
    const top = Math.max(r.top, box.top + parseFloat(style.borderTopWidth)), bottom = Math.min(r.bottom, box.bottom - parseFloat(style.borderBottomWidth))
    return { x: left, y: top, width: right - left, height: bottom - top, left, right, top, bottom }
  }
  const toRect = (r) => ({ x: r.x - base.x, y: r.y - base.y, w: r.width, h: r.height })
  const items = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (n) => n.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT })
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const el = node.parentElement
    const style = getComputedStyle(el)
    if ((onScreenOnly && seen.has(node)) || style.visibility === 'hidden' || el.closest('[aria-hidden="true"], svg, script, style, option') || opacityOf(el) < 0.1) continue
    const range = document.createRange()
    range.selectNodeContents(node)
    const boxes = [...range.getClientRects()].map((r) => insideBorders(el, r)).filter((r) => r.width > 1 && r.height > 1 && visibleIn(el, r))
    if (!boxes.length || !boxes.every((r) => onScreen(el, r))) continue
    if (onScreenOnly) seen.add(node)
    const rects = boxes.map(toRect)
    items.push({ where: describe(el), text: node.textContent.trim().slice(0, 50), color: parse(style.color), opacity: opacityOf(el), size: parseFloat(style.fontSize), weight: Number(style.fontWeight), rects })
  }
  for (const input of root.querySelectorAll('input:not([type=hidden]):not([type=checkbox]), textarea')) {
    const r = input.getBoundingClientRect()
    const usePlaceholder = !input.value && input.placeholder
    if ((onScreenOnly && seen.has(input)) || !r.width || input.closest('[aria-hidden="true"]') || (!usePlaceholder && !input.value) || !visibleIn(input, r) || !onScreen(input, r)) continue
    if (onScreenOnly) seen.add(input)
    const style = getComputedStyle(input, usePlaceholder ? '::placeholder' : null)
    const pad = parseFloat(getComputedStyle(input).paddingLeft) || 0
    items.push({ where: describe(input) + (usePlaceholder ? '::placeholder' : ' (value)'), text: (usePlaceholder ? input.placeholder : input.value).slice(0, 50), color: parse(style.color), opacity: opacityOf(input), size: parseFloat(getComputedStyle(input).fontSize), weight: Number(getComputedStyle(input).fontWeight), rects: [toRect({ x: r.x + pad, y: r.y + 4, width: Math.min(r.width - pad * 2, 220), height: r.height - 8 })] })
  }
  return items
}

// Runs in the page: compares each text colour with the screenshot pixels behind it.
async function compareWithBackground({ items, png }) {
  const img = new Image()
  img.src = `data:image/png;base64,${png}`
  await img.decode()
  const canvas = document.createElement('canvas')
  canvas.width = img.width
  canvas.height = img.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(img, 0, 0)
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
  const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
  return items.map((item) => {
    const ratios = []
    const alpha = item.color.a * item.opacity
    for (const rect of item.rects) {
      // Whole pixels inside the box only: an edge pixel can be blended with a neighbouring border.
      const x0 = Math.max(0, Math.ceil(rect.x)), y0 = Math.max(0, Math.ceil(rect.y))
      const w = Math.min(canvas.width, Math.floor(rect.x + rect.w)) - x0, h = Math.min(canvas.height, Math.floor(rect.y + rect.h)) - y0
      if (w <= 0 || h <= 0) continue
      const px = ctx.getImageData(x0, y0, w, h).data
      for (let i = 0; i < px.length; i += 12) {
        const bg = [px[i], px[i + 1], px[i + 2]]
        const fg = [item.color.r, item.color.g, item.color.b].map((c, k) => alpha * c + (1 - alpha) * bg[k])
        const l1 = lum(...fg), l2 = lum(...bg)
        ratios.push((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05))
      }
    }
    ratios.sort((a, b) => a - b)
    const large = item.size >= 24 || (item.size >= 18.66 && item.weight >= 700)
    return { where: item.where, text: item.text, color: item.color, worst: ratios[Math.floor(ratios.length * 0.05)] ?? null, needed: large ? 3 : 4.5 }
  })
}

const HIDE_TEXT = '*, *::placeholder, *::before, *::after { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; caret-color: transparent !important; text-decoration-color: transparent !important; }'
const failures = new Map()

function record(results, state, kind) {
  for (const r of results) {
    if (r.worst === null || r.worst >= r.needed) continue
    const exemption = EXEMPT.find((e) => r.where.includes(e.where))
    const hex = '#' + [r.color.r, r.color.g, r.color.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
    const key = `${kind}|${r.where}|${hex}`
    const entry = failures.get(key) ?? { kind, where: r.where, text: r.text, color: hex, worst: r.worst, needed: r.needed, exemption, states: new Set() }
    entry.worst = Math.min(entry.worst, r.worst)
    entry.states.add(state)
    failures.set(key, entry)
  }
}

async function measurePage(page, state, rootSelector = null) {
  await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo({ top: 0, behavior: 'instant' }) })
  await page.mouse.move(0, 0)
  await page.waitForTimeout(400)
  // 1. axe-core.
  await page.addScriptTag({ content: AXE_SOURCE })
  const axeFailures = await page.evaluate(async () => (await window.axe.run(document, { runOnly: ['color-contrast'] })).violations.flatMap((v) => v.nodes.map((n) => ({ where: n.target.join(' '), text: n.html.slice(0, 50), color: { r: 0, g: 0, b: 0 }, worst: n.any[0]?.data?.contrastRatio ?? 0, needed: n.any[0]?.data?.expectedContrastRatio ? parseFloat(n.any[0].data.expectedContrastRatio) : 4.5 }))))
  record(axeFailures, state, 'axe')
  // 2. Pixels, one screen at a time.
  await page.evaluate(() => { window.__contrastSeen = new WeakSet() })
  const { pageHeight, screen } = await page.evaluate(() => ({ pageHeight: document.documentElement.scrollHeight, screen: innerHeight }))
  for (let top = 0; top < pageHeight; top += Math.floor(screen * 0.6)) {
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), top)
    await page.waitForTimeout(80)
    const items = await page.evaluate(collectText, { rootSelector, relativeToRoot: false, onScreenOnly: true })
    if (!items.length) continue
    const hide = await page.addStyleTag({ content: HIDE_TEXT })
    const png = await page.screenshot({ animations: 'disabled' })
    await hide.evaluate((el) => el.remove())
    record(await page.evaluate(compareWithBackground, { items, png: png.toString('base64') }), state, 'pixels')
  }
}

async function measureHover(page, state) {
  const selector = 'a, button:not(:disabled), [role="button"], .panel-capability-card, .service-mini-card, .product-row, .product-category, .shop-product-card'
  const noMotion = await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation: none !important; }' })
  const count = await page.locator(selector).count()
  for (let i = 0; i < count; i++) {
    const element = page.locator(selector).nth(i)
    if (!(await element.isVisible())) continue
    // Skip tiny elements and ones placed above the page (skip links until focused). Position is taken
    // relative to the page, not the screen, because earlier hovers have scrolled the page.
    const box = await element.evaluate((el) => { const r = el.getBoundingClientRect(); return { width: r.width, height: r.height, pageBottom: r.bottom + scrollY } })
    if (box.width < 4 || box.height < 4 || box.pageBottom <= 0) continue
    // Centre it, so a sticky header cannot cover it in the screenshot.
    await element.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }))
    await element.hover({ force: true }).catch(() => {})
    await element.evaluate((el) => el.setAttribute('data-contrast-target', ''))
    const items = await page.evaluate(collectText, { rootSelector: '[data-contrast-target]', relativeToRoot: true, onScreenOnly: false })
    await element.evaluate((el) => el.removeAttribute('data-contrast-target'))
    if (!items.length) continue
    const hide = await page.addStyleTag({ content: HIDE_TEXT })
    const png = await element.screenshot({ animations: 'disabled' }).catch(() => null)
    await hide.evaluate((el) => el.remove())
    if (png) record(await page.evaluate(compareWithBackground, { items, png: png.toString('base64') }), `${state} (hover)`, 'hover')
  }
  await noMotion.evaluate((el) => el.remove())
  await page.mouse.move(0, 0)
}

// ── Pages and states ────────────────────────────────────────────────────────────────────────────

const browser = await chromium.launch({ headless: !process.argv.includes('--headed') })
for (const [width, height] of WIDTHS) {
  const label = width > 600 ? 'desktop' : 'phone'
  const state = { loggedIn: false, loginFails: false, formsFail: false }
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce', deviceScaleFactor: 1 })
  await mockApi(context, state)
  const page = await context.newPage()
  const open = async (hash, waitFor) => { await page.goto(`${SITE}/${hash}`); await page.reload({ waitUntil: 'networkidle' }); await page.waitForSelector(waitFor) }
  const hovering = width > 600

  await open('', '.hero'); await measurePage(page, `${label} home`)
  if (hovering) await measureHover(page, `${label} home`)
  state.formsFail = true
  await page.fill('input[name="name"]', 'Sample'); await page.fill('.quote-form input[name="email"]', 'sample@example.com'); await page.fill('textarea[name="message"]', 'Sample')
  await page.click('.quote-form button[type="submit"]'); await page.waitForSelector('.quote-form .form-error'); await measurePage(page, `${label} contact form error`)
  state.formsFail = false
  await page.click('.quote-form button[type="submit"]'); await page.waitForSelector('.quote-form .success-message'); await measurePage(page, `${label} contact form sent`)

  await open('#shop', '.shop-product-card'); await measurePage(page, `${label} shop`)
  if (hovering) await measureHover(page, `${label} shop`)
  await page.locator('.shop-product-preview').first().click(); await page.waitForSelector('.shop-lightbox'); await measurePage(page, `${label} product window`, '.shop-lightbox-content')
  await page.keyboard.press('Escape')
  await page.locator('.shop-add-button').first().click(); await measurePage(page, `${label} shop with cart`)
  await page.locator('.shop-order-button').click(); await page.waitForSelector('.shop-order-form'); await measurePage(page, `${label} order form`)
  state.formsFail = true
  await page.fill('input[name="fullName"]', 'Sample'); await page.fill('.shop-order-form input[name="email"]', 'sample@example.com'); await page.fill('input[name="phone"]', '0800')
  await page.locator('.shop-order-form button[type="submit"]').click(); await page.waitForSelector('.shop-form-error'); await measurePage(page, `${label} order error`)
  state.formsFail = false
  await page.locator('.shop-order-form button[type="submit"]').click(); await page.waitForSelector('.shop-confirmation'); await measurePage(page, `${label} order confirmation`)
  await open('#shop/order', '.shop-empty-order'); await measurePage(page, `${label} empty order page`)

  await open('#privacy', '.privacy-page'); await measurePage(page, `${label} privacy notice`)

  await open('#admin', '.admin-login'); await measurePage(page, `${label} admin login`)
  state.loginFails = true
  await page.fill('input[name="email"]', 'admin@example.com'); await page.fill('input[name="password"]', 'wrong'); await page.click('.admin-form button[type="submit"]')
  await page.waitForSelector('.form-error'); await measurePage(page, `${label} admin login error`)
  state.loginFails = false
  await page.click('.admin-form button[type="submit"]'); await page.waitForSelector('.admin-product-list'); await measurePage(page, `${label} admin products`)
  if (hovering) await measureHover(page, `${label} admin products`)
  await open('#admin/products/panel-001', '.admin-history ol'); await measurePage(page, `${label} admin product edit`)
  await open('#admin/new', '#product-id'); await page.click('.admin-product-form button[type="submit"]'); await measurePage(page, `${label} admin new product`)
  await open('#admin/password', '#currentPassword'); await page.fill('#currentPassword', 'x'); await page.fill('#newPassword', 'short'); await page.fill('#confirmPassword', 'short'); await page.click('.admin-form button[type="submit"]'); await page.waitForSelector('.admin-field-error'); await measurePage(page, `${label} admin password errors`)
  await open('#admin/enquiries', '.admin-request-list'); await measurePage(page, `${label} admin enquiries`)
  await open(`#admin/enquiries/${enquiryRef}`, '.admin-request-detail'); await measurePage(page, `${label} admin enquiry`)
  if (hovering) await measureHover(page, `${label} admin enquiry`)
  await open(`#admin/contact-requests/${contactRef}`, '.admin-request-detail'); await measurePage(page, `${label} admin contact request`)
  await context.close()
  console.log(`Checked ${label} width.`)
}
await browser.close()

// ── Report ──────────────────────────────────────────────────────────────────────────────────────

const all = [...failures.values()].sort((a, b) => a.worst - b.worst)
const failing = all.filter((f) => !f.exemption)
const format = (f) => `  ${f.worst.toFixed(2)}:1 (needs ${f.needed}:1) [${f.kind}] ${f.color} "${f.text}"\n      ${f.where}\n      seen in: ${[...f.states].slice(0, 4).join('; ')}${f.states.size > 4 ? ` and ${f.states.size - 4} more` : ''}`
for (const reason of new Set(all.filter((f) => f.exemption).map((f) => f.exemption.reason))) console.log(`Exempt: ${reason}`)
if (failing.length === 0) {
  console.log('All text meets WCAG AA contrast.')
} else {
  console.log(`${failing.length} text element(s) below WCAG AA contrast:\n${failing.map(format).join('\n')}`)
  process.exitCode = 1
}
