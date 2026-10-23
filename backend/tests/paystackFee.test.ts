import { describe, expect, it } from 'vitest'
import { paystackFeeFor } from '../src/services/paystackFee.js'
import { TEST_PAYMENTS } from './helpers.js'

const rule = TEST_PAYMENTS.fee

// What Paystack itself deducts from a charge under the same rule.
function paystackDeducts(charge: number) {
  const flat = charge < rule.flatWaivedBelow ? 0 : rule.flat
  return Math.min(Math.ceil((charge * rule.percentBasisPoints) / 10_000) + flat, rule.cap)
}

describe('paystackFeeFor', () => {
  it.each([
    // ₦10,000 order: charge ₦10,253.81, of which Paystack takes 1.5% (₦153.81) + ₦100.
    [1_000_000, 25_381],
    // ₦2,000: the charge stays under ₦2,500, so the ₦100 is waived.
    [200_000, 3_046],
    // ₦200,000: Paystack's fee reaches its ₦2,000 cap.
    [20_000_000, 200_000],
    [0, 0],
  ])('charges %i kobo a fee of %i kobo', (amount, fee) => {
    expect(paystackFeeFor(amount, rule)).toBe(fee)
  })

  it('always leaves GPEC at least the order value after Paystack’s fee, around every boundary', () => {
    for (let amount = 100; amount < 30_000_000; amount = Math.ceil(amount * 1.013) + 7) {
      const charge = amount + paystackFeeFor(amount, rule)
      expect(charge - paystackDeducts(charge)).toBeGreaterThanOrEqual(amount)
      // And never more than a kobo or so over.
      expect(charge - paystackDeducts(charge) - amount).toBeLessThanOrEqual(2)
    }
  })

  it('handles a plan with no flat part', () => {
    expect(paystackFeeFor(1_000_000, { ...rule, flat: 0 })).toBe(15_229)
  })
})
