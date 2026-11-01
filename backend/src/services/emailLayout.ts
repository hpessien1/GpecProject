// The look of every email the site sends: GPEC's logo on a navy band, a headline, and blocks of
// content. Tables and inline styles, because that is what mail apps reliably show.
//
// Safe by default: the html`` tag and every block escape what they are given, unless it is already Html
// made here, so nothing a customer or staff member typed can become markup. Only addresses the server
// built go in links and buttons (link() checks they are web addresses); customers' own text stays plain.
import { LINE_BREAK } from '../validation/fields.js'

export class Html {
  constructor(readonly value: string) {}
}

type Content = string | number | Html | null | undefined | false | Content[]

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ESCAPES[character] ?? character)

function render(content: Content): string {
  if (content === null || content === undefined || content === false) return ''
  if (content instanceof Html) return content.value
  if (Array.isArray(content)) return content.map(render).join('')
  return escapeHtml(String(content))
}

export function html(strings: TemplateStringsArray, ...values: Content[]) {
  return new Html(strings.reduce((all, part, index) => all + part + (index < values.length ? render(values[index]) : ''), ''))
}

const INK = '#061747'
const NAVY = '#061d63'
const ORANGE = '#ff7600'
const MUTED = '#3f4c6b'
const LINK = '#0a3da5'
const LINE = '#dfe3ec'
const SHADE = '#f4f5f8'
const FONT = 'Arial, Helvetica, sans-serif'
const MONO = "Consolas, Menlo, 'Courier New', monospace"
const raw = (value: string) => new Html(value)
const webAddress = (url: string) => /^https?:\/\/[^\s]+$/.test(url)

export const link = (label: string, url: string) => webAddress(url)
  ? html`<a href="${url}" style="${raw(`color:${LINK};text-decoration:underline`)}">${label}</a>`
  : html`${label}`

export const paragraph = (content: Content) => html`<p style="${raw(`margin:0 0 16px;color:${INK};font:15px/1.6 ${FONT}`)}">${content}</p>`

// Smaller text, for what follows the main point.
export const note = (content: Content) => html`<p style="${raw(`margin:0 0 12px;color:${MUTED};font:13px/1.6 ${FONT}`)}">${content}</p>`

export const heading = (content: Content) => html`<h2 style="${raw(`margin:24px 0 10px;color:${INK};font:bold 15px/1.4 ${FONT}`)}">${content}</h2>`

// A figure the email is about, such as the total paid.
export const highlight = (label: string, value: string) => html`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px"><tr><td align="center" bgcolor="${SHADE}" style="${raw(`padding:18px 16px;background:${SHADE}`)}"><div style="${raw(`color:${MUTED};font:13px/1.4 ${FONT}`)}">${label}</div><div style="${raw(`color:${NAVY};font:bold 28px/1.3 ${FONT}`)}">${value}</div></td></tr></table>`

// Label and value rows. A code is a reference or account number, set so its characters are easy to tell apart.
export interface DetailRow {
  label: string
  value: Content
  code?: boolean
}

export function details(rows: (DetailRow | null | false)[]) {
  const cell = `padding:10px 0;border-bottom:1px solid ${LINE};vertical-align:top`
  const shown = rows.filter((row): row is DetailRow => Boolean(row))
  return html`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px">${shown.map((row) => html`<tr><td width="36%" style="${raw(`${cell};padding-right:12px;color:${MUTED};font:14px/1.5 ${FONT}`)}">${row.label}</td><td style="${raw(`${cell};color:${INK};font:${row.code ? `bold 14px/1.5 ${MONO}` : `bold 14px/1.5 ${FONT}`};word-break:break-word`)}">${row.value}</td></tr>`)}</table>`
}

// What a customer or staff member wrote over several lines. Set apart in a shaded box under a label
// that says whose words they are, so none can pass for GPEC's own.
export function quotedBlock(label: string, text: string) {
  const lines = text.split(new RegExp(`\r\n|${LINE_BREAK.source}`))
  return html`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px"><tr><td bgcolor="${SHADE}" style="${raw(`padding:12px 14px;background:${SHADE};border-left:3px solid ${ORANGE}`)}"><div style="${raw(`margin:0 0 6px;color:${MUTED};font:13px/1.4 ${FONT}`)}">${label}</div><div style="${raw(`color:${INK};font:14px/1.6 ${FONT};word-break:break-word`)}">${lines.map((line, index) => html`${index > 0 && raw('<br>')}${line}`)}</div></td></tr></table>`
}

// The main action. Dark text on orange, as on the site's primary buttons.
export function button(label: string, url: string) {
  if (!webAddress(url)) return paragraph(label)
  return html`<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 20px"><tr><td bgcolor="${ORANGE}" style="${raw(`background:${ORANGE}`)}"><a href="${url}" style="${raw(`display:inline-block;padding:13px 22px;color:${INK};font:bold 14px/1.2 ${FONT};text-decoration:none`)}">${label}</a></td></tr></table>`
}

// A code to type in: large and spaced, in the middle.
export const codeBlock = (code: string) => html`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px"><tr><td align="center" bgcolor="${SHADE}" style="${raw(`padding:18px 12px;background:${SHADE};color:${NAVY};font:bold 30px/1.2 ${MONO};letter-spacing:6px`)}">${code}</td></tr></table>`

// Something that must not be missed, such as sample bank details.
export const warning = (content: Content) => html`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px"><tr><td bgcolor="#fdecea" style="${raw(`padding:12px 14px;background:#fdecea;border-left:3px solid #a80000;color:#7a0000;font:bold 14px/1.5 ${FONT}`)}">${content}</td></tr></table>`

export interface OrderTable {
  currencyAmount: (minorUnits: number) => string
  items: { name: string, reference: string, unitPrice: number, quantity: number, lineTotal: number }[]
  charges: { label: string, amount: number }[]
  totalLabel: string
  total: number
}

export function orderTable({ currencyAmount, items, charges, totalLabel, total }: OrderTable) {
  const amountCell = `padding:10px 0 10px 12px;vertical-align:top;white-space:nowrap`
  return html`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px">
    ${items.map((item) => html`<tr><td style="${raw(`padding:10px 0;border-bottom:1px solid ${LINE};vertical-align:top`)}"><div style="${raw(`color:${INK};font:bold 14px/1.4 ${FONT}`)}">${item.name}</div><div style="${raw(`color:${MUTED};font:13px/1.5 ${FONT}`)}">${item.quantity} × ${currencyAmount(item.unitPrice)} · ${item.reference}</div></td><td align="right" style="${raw(`${amountCell};border-bottom:1px solid ${LINE};color:${INK};font:bold 14px/1.4 ${FONT}`)}">${currencyAmount(item.lineTotal)}</td></tr>`)}
    ${charges.map((charge, index) => html`<tr><td style="${raw(`padding:${index === 0 ? '12px' : '4px'} 0 0;color:${MUTED};font:14px/1.5 ${FONT}`)}">${charge.label}</td><td align="right" style="${raw(`padding:${index === 0 ? '12px' : '4px'} 0 0 12px;white-space:nowrap;color:${INK};font:14px/1.5 ${FONT}`)}">${currencyAmount(charge.amount)}</td></tr>`)}
    <tr><td style="${raw(`padding:12px 0 0;color:${INK};font:bold 16px/1.4 ${FONT}`)}">${totalLabel}</td><td align="right" style="${raw(`padding:12px 0 0 12px;white-space:nowrap;color:${NAVY};font:bold 18px/1.4 ${FONT}`)}">${currencyAmount(total)}</td></tr>
  </table>`
}

export interface EmailPage {
  siteUrl: string
  // The line mail apps show beside the subject. Fixed wording only: never a code or customer's text.
  preview: string
  headline: string
  // Who it is for decides the line under the footer.
  audience: 'customer' | 'staff'
  blocks: Content
  // While Paystack is on test keys, order emails say they are tests.
  testNotice?: string | null
}

// Mail apps otherwise fill the preview with the start of the body, which could be a login code.
const PREVIEW_FILLER = '&#847;&zwnj;&nbsp;'.repeat(60)

export function emailPage({ siteUrl, preview, headline, audience, blocks, testNotice }: EmailPage) {
  const footer = audience === 'customer' ? 'You received this email because this address was used on the GPEC Engineering website.' : 'Sent to GPEC staff by the GPEC Engineering website.'
  return html`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${headline}</title><style>:root{color-scheme:light}@media (max-width:620px){.email-pad{padding-left:18px!important;padding-right:18px!important}.email-outer{padding:0!important}}</style></head>
<body style="${raw(`margin:0;padding:0;background:${SHADE}`)}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px">${preview}${raw(PREVIEW_FILLER)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${SHADE}" style="${raw(`background:${SHADE}`)}"><tr><td class="email-outer" align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="max-width:600px;background:#ffffff">
${testNotice && html`<tr><td align="center" bgcolor="#a80000" style="${raw(`padding:10px 16px;background:#a80000;color:#ffffff;font:bold 13px/1.5 ${FONT}`)}">${testNotice}</td></tr>`}
<tr><td class="email-pad" align="center" bgcolor="${NAVY}" style="${raw(`padding:22px 32px 24px;background:${NAVY};border-bottom:4px solid ${ORANGE}`)}"><img src="${`${siteUrl}/assets/gpec-email-logo.png`}" width="150" height="90" alt="GPEC Engineering" style="${raw(`display:block;margin:0 auto 14px;border:0;color:#ffffff;font:bold 20px/1.3 ${FONT}`)}"><h1 style="${raw(`margin:0;color:#ffffff;font:bold 22px/1.3 ${FONT}`)}">${headline}</h1></td></tr>
<tr><td class="email-pad" style="padding:28px 32px 12px">${blocks}</td></tr>
<tr><td class="email-pad" bgcolor="${SHADE}" style="${raw(`padding:18px 32px;background:${SHADE};border-top:1px solid ${LINE};color:${MUTED};font:12px/1.6 ${FONT}`)}"><strong>GPEC Engineering</strong> · ${link(siteUrl.replace(/^https?:\/\//, ''), siteUrl)}<br>${footer}</td></tr>
</table></td></tr></table></body></html>`.value
}
