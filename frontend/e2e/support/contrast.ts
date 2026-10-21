import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import type { Page } from '@playwright/test'

// Text contrast measurement (WCAG AA): 4.5:1 for normal text, 3:1 for large text (24px+, or
// 18.66px+ bold). Used by e2e/contrast.spec.ts. Three checks:
//   1. axe-core's colour-contrast rule.
//   2. A pixel check against what is really behind the text (photos, gradients, overlays), which axe
//      cannot judge: scroll one screen at a time, record the text fully on screen and not covered
//      (e.g. by the sticky header), hide all text, screenshot, and compare. Each element is judged by
//      its worst 5% of background. Full-page screenshots are not used: they resize the window, which
//      changes window-sized sections and shifts everything below them.
//   3. The same pixel check with each link, button, and card hovered.

const AXE_SOURCE = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8')
const HIDE_TEXT = '*, *::placeholder, *::before, *::after { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; caret-color: transparent !important; text-decoration-color: transparent !important; }'
const HOVER_TARGETS = 'a, button:not(:disabled), [role="button"], .panel-capability-card, .service-mini-card, .product-row, .product-category, .shop-product-card'

// Text WCAG does not cover. Each entry needs a reason.
export const EXEMPT = [
  { where: 'span.panel-label', reason: 'Part of the decorative hero illustration (inside role="img"); WCAG exempts text in pictures.' },
]

interface Colour { r: number, g: number, b: number, a: number }
interface Box { x: number, y: number, w: number, h: number }
interface TextItem { where: string, text: string, color: Colour, opacity: number, size: number, weight: number, rects: Box[] }
interface Measured { where: string, text: string, color: Colour, worst: number | null, needed: number }
export interface Failure { kind: string, where: string, text: string, color: string, worst: number, needed: number, states: Set<string> }

// Runs in the page: every visible text box (and input placeholder/value) under root, with colour,
// effective opacity, size, and position relative to the screenshot that will be taken. Text clipped
// by a scrolling container is skipped, as is fully transparent text (shown only on hover; covered by
// the hover pass). With onScreenOnly, only text fully on screen, not covered by another element, and
// not already measured at an earlier scroll position is returned.
function collectText({ rootSelector, relativeToRoot, onScreenOnly }: { rootSelector: string | null, relativeToRoot: boolean, onScreenOnly: boolean }): TextItem[] {
  const root = rootSelector ? document.querySelector(rootSelector) : document.body
  if (!root) return []
  const base = relativeToRoot ? root.getBoundingClientRect() : { x: 0, y: 0 }
  const store = window as unknown as { __contrastSeen?: WeakSet<Node> }
  store.__contrastSeen ??= new WeakSet()
  const seen = store.__contrastSeen
  const parse = (c: string): Colour => { const m = (c.match(/[\d.]+/g) ?? []).map(Number); return { r: m[0], g: m[1], b: m[2], a: m[3] ?? 1 } }
  const opacityOf = (el: Element) => { let o = 1; for (let e: Element | null = el; e; e = e.parentElement) o *= Number(getComputedStyle(e).opacity); return o }
  const describe = (el: Element) => {
    const parts: string[] = []
    for (let e: Element | null = el; e && e !== document.body && parts.length < 3; e = e.parentElement) parts.unshift(e.tagName.toLowerCase() + (e.classList.length ? '.' + [...e.classList].join('.') : ''))
    return parts.join(' > ')
  }
  // False when a scrolling or clipping container hides the text (in either direction).
  const visibleIn = (el: Element, r: DOMRect) => {
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
  const insideBorders = (el: Element, r: DOMRect) => {
    const box = el.getBoundingClientRect()
    const style = getComputedStyle(el)
    const left = Math.max(r.left, box.left + parseFloat(style.borderLeftWidth)), right = Math.min(r.right, box.right - parseFloat(style.borderRightWidth))
    const top = Math.max(r.top, box.top + parseFloat(style.borderTopWidth)), bottom = Math.min(r.bottom, box.bottom - parseFloat(style.borderBottomWidth))
    return new DOMRect(left, top, right - left, bottom - top)
  }
  const onScreen = (el: Element, r: DOMRect) => {
    if (!onScreenOnly) return true
    if (r.top < 0 || r.bottom > innerHeight || r.left < 0 || r.right > innerWidth) return false
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    return !!hit && (el.contains(hit) || hit.contains(el))
  }
  const toBox = (r: DOMRect): Box => ({ x: r.x - base.x, y: r.y - base.y, w: r.width, h: r.height })
  const items: TextItem[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (n) => n.textContent?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT })
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const el = node.parentElement
    if (!el || (onScreenOnly && seen.has(node))) continue
    const style = getComputedStyle(el)
    if (style.visibility === 'hidden' || el.closest('[aria-hidden="true"], svg, script, style, option') || opacityOf(el) < 0.1) continue
    const range = document.createRange()
    range.selectNodeContents(node)
    const boxes = [...range.getClientRects()].map((r) => insideBorders(el, r)).filter((r) => r.width > 1 && r.height > 1 && visibleIn(el, r))
    if (!boxes.length || !boxes.every((r) => onScreen(el, r))) continue
    if (onScreenOnly) seen.add(node)
    items.push({ where: describe(el), text: (node.textContent ?? '').trim().slice(0, 50), color: parse(style.color), opacity: opacityOf(el), size: parseFloat(style.fontSize), weight: Number(style.fontWeight), rects: boxes.map(toBox) })
  }
  for (const input of root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input:not([type=hidden]):not([type=checkbox]), textarea')) {
    const r = input.getBoundingClientRect()
    const usePlaceholder = !input.value && !!input.placeholder
    if ((onScreenOnly && seen.has(input)) || !r.width || input.closest('[aria-hidden="true"]') || (!usePlaceholder && !input.value) || !visibleIn(input, r) || !onScreen(input, r)) continue
    if (onScreenOnly) seen.add(input)
    const style = getComputedStyle(input, usePlaceholder ? '::placeholder' : null)
    const pad = parseFloat(getComputedStyle(input).paddingLeft) || 0
    items.push({ where: describe(input) + (usePlaceholder ? '::placeholder' : ' (value)'), text: (usePlaceholder ? input.placeholder : input.value).slice(0, 50), color: parse(style.color), opacity: opacityOf(input), size: parseFloat(getComputedStyle(input).fontSize), weight: Number(getComputedStyle(input).fontWeight), rects: [toBox(new DOMRect(r.x + pad, r.y + 4, Math.min(r.width - pad * 2, 220), r.height - 8))] })
  }
  return items
}

// Runs in the page: compares each text colour with the screenshot pixels behind it.
async function compareWithBackground({ items, png }: { items: TextItem[], png: string }): Promise<Measured[]> {
  const img = new Image()
  img.src = `data:image/png;base64,${png}`
  await img.decode()
  const canvas = document.createElement('canvas')
  canvas.width = img.width
  canvas.height = img.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return []
  ctx.drawImage(img, 0, 0)
  const lin = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
  const lum = (r: number, g: number, b: number) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
  return items.map((item) => {
    const ratios: number[] = []
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
        const l1 = lum(fg[0], fg[1], fg[2]), l2 = lum(bg[0], bg[1], bg[2])
        ratios.push((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05))
      }
    }
    ratios.sort((a, b) => a - b)
    const large = item.size >= 24 || (item.size >= 18.66 && item.weight >= 700)
    return { where: item.where, text: item.text, color: item.color, worst: ratios[Math.floor(ratios.length * 0.05)] ?? null, needed: large ? 3 : 4.5 }
  })
}

export class ContrastAudit {
  readonly failures = new Map<string, Failure>()

  private record(results: Measured[], state: string, kind: string) {
    for (const r of results) {
      if (r.worst === null || r.worst >= r.needed || EXEMPT.some((e) => r.where.includes(e.where))) continue
      const color = '#' + [r.color.r, r.color.g, r.color.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
      const key = `${kind}|${r.where}|${color}`
      const entry = this.failures.get(key) ?? { kind, where: r.where, text: r.text, color, worst: r.worst, needed: r.needed, states: new Set<string>() }
      entry.worst = Math.min(entry.worst, r.worst)
      entry.states.add(state)
      this.failures.set(key, entry)
    }
  }

  // The whole page as it stands (or only inside rootSelector, e.g. an open dialog).
  async page(page: Page, state: string, rootSelector: string | null = null) {
    await page.evaluate(() => { (document.activeElement as HTMLElement | null)?.blur(); window.scrollTo({ top: 0, behavior: 'instant' }) })
    await page.mouse.move(0, 0)
    await page.waitForTimeout(400)
    await page.addScriptTag({ content: AXE_SOURCE })
    const axeResults = await page.evaluate(async () => {
      const axe = (window as unknown as { axe: { run: (context: Document, options: object) => Promise<{ violations: { nodes: { target: string[], html: string, any: { data?: { contrastRatio?: number, expectedContrastRatio?: string } }[] }[] }[] }> } }).axe
      const result = await axe.run(document, { runOnly: ['color-contrast'] })
      return result.violations.flatMap((v) => v.nodes.map((n) => ({ where: n.target.join(' '), text: n.html.slice(0, 50), color: { r: 0, g: 0, b: 0, a: 1 }, worst: n.any[0]?.data?.contrastRatio ?? 0, needed: n.any[0]?.data?.expectedContrastRatio ? parseFloat(n.any[0].data.expectedContrastRatio) : 4.5 })))
    })
    this.record(axeResults, state, 'axe')
    await page.evaluate(() => { (window as unknown as { __contrastSeen: WeakSet<Node> }).__contrastSeen = new WeakSet() })
    const { pageHeight, screen } = await page.evaluate(() => ({ pageHeight: document.documentElement.scrollHeight, screen: innerHeight }))
    for (let top = 0; top < pageHeight; top += Math.floor(screen * 0.6)) {
      await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), top)
      await page.waitForTimeout(80)
      const items = await page.evaluate(collectText, { rootSelector, relativeToRoot: false, onScreenOnly: true })
      if (!items.length) continue
      const hide = await page.addStyleTag({ content: HIDE_TEXT })
      const png = await page.screenshot({ animations: 'disabled' })
      await hide.evaluate((el) => el.parentNode?.removeChild(el))
      this.record(await page.evaluate(compareWithBackground, { items, png: png.toString('base64') }), state, 'pixels')
    }
  }

  // Each link, button, and card on the page, hovered, with transitions off.
  async hover(page: Page, state: string) {
    const noMotion = await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation: none !important; }' })
    const count = await page.locator(HOVER_TARGETS).count()
    for (let i = 0; i < count; i++) {
      const element = page.locator(HOVER_TARGETS).nth(i)
      if (!(await element.isVisible())) continue
      // Skip tiny elements and ones placed above the page (skip links until focused). Position is
      // taken relative to the page, not the screen, because earlier hovers have scrolled the page.
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
      await hide.evaluate((el) => el.parentNode?.removeChild(el))
      if (png) this.record(await page.evaluate(compareWithBackground, { items, png: png.toString('base64') }), `${state} (hover)`, 'hover')
    }
    await noMotion.evaluate((el) => el.parentNode?.removeChild(el))
    await page.mouse.move(0, 0)
  }

  report() {
    return [...this.failures.values()].sort((a, b) => a.worst - b.worst).map((f) => `${f.worst.toFixed(2)}:1 (needs ${f.needed}:1) [${f.kind}] ${f.color} "${f.text}" | ${f.where} | seen in: ${[...f.states].slice(0, 4).join('; ')}`)
  }
}
