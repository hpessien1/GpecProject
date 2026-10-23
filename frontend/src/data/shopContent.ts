import { companyContact } from './landingContent'

// Checkout and payment wording (components/shop/Checkout.tsx, PaymentResult.tsx).
export const checkoutContent = {
  // Confirmed by the project owner as the pickup point (2026-10-23). Collection hours are not known
  // yet, so GPEC arranges a time with each customer.
  pickupAddress: companyContact.address,
  pickupNote: 'GPEC will contact you when your order is ready, to agree a collection time. Bring your order reference.',
  deliveryNote: 'GPEC will contact you to arrange the delivery.',
  noDeliveryAreas: 'GPEC has not listed its delivery areas yet, so orders can only be picked up for now. To ask about delivery, contact GPEC.',
  areaNotListed: 'Area not listed? Choose pickup, or contact GPEC to ask about delivery.',
  testMode: 'Test mode: this checkout uses Paystack’s test system. No real payment is taken.',
  privacy: 'GPEC uses these details only to fulfil and follow up your order. You pay on Paystack’s secure page: GPEC never sees your card details.',
  paystackNote: 'You will go to Paystack’s secure page to pay by card, bank transfer, or another option Paystack offers, then come back here.',
  paystackChoice: 'By card or another option Paystack offers, on Paystack’s secure page. Confirmed straight away. A payment processing fee is added.',
  transferChoice: 'Transfer the total to GPEC’s bank account from your banking app. No processing fee. GPEC prepares your order once the money arrives.',
  transferNote: (days: number) => `After you place the order, you will see GPEC’s bank details, the amount, and your order reference to use as the narration (they are emailed to you too). Please pay within ${days} day${days === 1 ? '' : 's'}.`,
  feeNote: 'The payment processing fee is what Paystack charges for handling the payment.',
}

export const paymentResultContent = {
  checking: 'Checking your payment with Paystack…',
  paidTitle: 'Thank you. Your order is paid.',
  paidEmail: 'A confirmation has been sent to the email address you gave.',
  pendingTitle: 'Waiting for confirmation',
  pendingText: 'Paystack has not confirmed this payment yet. If you have just paid, this can take a minute. If you left the payment page without paying, nothing was charged, and your cart is still here.',
  failedTitle: 'The payment did not go through',
  failedText: 'Paystack reported that the payment failed, so nothing was charged. Your cart is still here: you can try again.',
  transferTitle: 'Order placed: now pay by bank transfer',
  transferText: 'Transfer exactly this amount to GPEC’s account below. Use your order reference as the narration (the description or remark in your banking app) so GPEC can match your payment. The same details have been emailed to you.',
  transferNotice: 'GPEC prepares your order only once the money has arrived in its account.',
  transferReportedText: 'Thank you for letting GPEC know. GPEC will check its bank account and email you once your payment has arrived.',
  transferClosedTitle: 'This order was closed',
  transferClosedText: 'GPEC closed this order because the transfer did not arrive. If you did pay, contact GPEC with your order reference.',
}
