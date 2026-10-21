import type { CurrencyInfo } from '../types'

// Prices are stored as whole numbers of the smallest unit (kobo for NGN). These helpers convert to and
// from what an admin types ("1,500.50") using text, not floating-point arithmetic, so no rounding
// errors creep in.

export function formatPrice(minorUnits: number, currency: CurrencyInfo) {
  return new Intl.NumberFormat('en', { style: 'currency', currency: currency.code, currencyDisplay: 'narrowSymbol' }).format(minorUnits / 10 ** currency.minorUnitDigits)
}

// 150050 → "1500.50" (for an input field).
export function minorUnitsToInput(minorUnits: number | null, { minorUnitDigits }: CurrencyInfo) {
  if (minorUnits === null) return ''
  if (minorUnitDigits === 0) return String(minorUnits)
  const digits = String(minorUnits).padStart(minorUnitDigits + 1, '0')
  return `${digits.slice(0, -minorUnitDigits)}.${digits.slice(-minorUnitDigits)}`
}

// "1,500.5" → 150050; "" → null (no price); anything else → undefined (invalid).
export function inputToMinorUnits(input: string, { minorUnitDigits }: CurrencyInfo): number | null | undefined {
  const cleaned = input.replace(/[,\s]/g, '')
  if (!cleaned) return null
  const match = new RegExp(`^(\\d{1,10})(?:\\.(\\d{0,${minorUnitDigits}}))?$`).exec(cleaned)
  if (!match) return undefined
  return Number(match[1] + (match[2] ?? '').padEnd(minorUnitDigits, '0'))
}
