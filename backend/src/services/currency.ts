// Prices are stored as whole numbers of the smallest unit. How many decimal places that unit has
// comes from the currency itself (2 for NGN: 100 kobo per naira), never from a hard-coded value.
export function currencyInfo(code: string | null) {
  if (!code) return null
  const minorUnitDigits = new Intl.NumberFormat('en', { style: 'currency', currency: code }).resolvedOptions().maximumFractionDigits ?? 2
  return { code, minorUnitDigits }
}
