import type { PaystackFeeRule } from '../config.js'

// The customer pays Paystack's fee (owner's decision, 2026-10-23), as its own line. Paystack takes its
// fee from the amount charged, so the charge must be grossed up until what is left after Paystack's
// fee covers the order: charge − fee(charge) ≥ amount. All in whole smallest units (kobo), rounding up,
// so GPEC never receives less than the order's value.
//
// fee(charge) = percent × charge + flat (flat waived when charge < flatWaivedBelow), at most cap.
export function paystackFeeFor(amount: number, rule: PaystackFeeRule) {
  if (amount <= 0) return 0
  const remaining = 10_000 - rule.percentBasisPoints
  const grossUp = (base: number) => Math.ceil((base * 10_000) / remaining)
  // Without the flat part first: if even that charge is below the waiver line, no flat fee applies.
  const withoutFlat = grossUp(amount)
  const charge = rule.flat > 0 && withoutFlat >= rule.flatWaivedBelow ? grossUp(amount + rule.flat) : withoutFlat
  return Math.min(charge - amount, rule.cap)
}
