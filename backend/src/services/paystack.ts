import { createHmac, timingSafeEqual } from 'node:crypto'

const PAYSTACK_API = 'https://api.paystack.co'
const TIMEOUT_MS = 15_000

export interface StartedTransaction {
  authorizationUrl: string
}

// What Paystack reports about a transaction. status is Paystack's own word: success, failed,
// abandoned, ongoing, pending, reversed, …
export interface TransactionResult {
  reference: string
  status: string
  // In the currency's smallest unit, as charged.
  amount: number
  currency: string
}

// Anything that can start and check Paystack transactions. Production calls Paystack's API; tests
// pass a stand-in (tests/helpers.ts), so they never reach the internet.
export interface PaystackClient {
  initialize(transaction: { reference: string, email: string, amount: number, currency: string, callbackUrl: string, orderReference: string }): Promise<StartedTransaction>
  // null when Paystack has no transaction with this reference (the customer never reached the page).
  verify(reference: string): Promise<TransactionResult | null>
}

export class PaystackError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PaystackError'
  }
}

// The only code that talks to Paystack (CLAUDE.md Section 8). The secret key is sent only in the
// Authorization header and never logged or put in an error message.
export function paystackClient(secretKey: string): PaystackClient {
  // GET without a body, POST with one.
  async function call(path: string, body?: unknown) {
    let response: Response
    try {
      const headers = { Authorization: `Bearer ${secretKey}` }
      const signal = AbortSignal.timeout(TIMEOUT_MS)
      response = body === undefined
        ? await fetch(`${PAYSTACK_API}${path}`, { headers, signal })
        : await fetch(`${PAYSTACK_API}${path}`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal })
    } catch (error) {
      throw new PaystackError(`Paystack could not be reached (${error instanceof Error ? error.name : 'unknown error'}).`)
    }
    const payload: unknown = await response.json().catch(() => null)
    return { status: response.status, payload: (payload && typeof payload === 'object' ? payload : {}) as { status?: unknown, message?: unknown, data?: Record<string, unknown> } }
  }

  return {
    async initialize({ reference, email, amount, currency, callbackUrl, orderReference }) {
      const { status, payload } = await call('/transaction/initialize', {
        reference,
        email,
        amount,
        currency,
        callback_url: callbackUrl,
        metadata: { order_reference: orderReference },
      })
      const authorizationUrl = payload.data?.authorization_url
      if (status !== 200 || payload.status !== true || typeof authorizationUrl !== 'string' || !authorizationUrl.startsWith('https://')) {
        throw new PaystackError(`Paystack did not start the payment (HTTP ${status}).`)
      }
      return { authorizationUrl }
    },
    async verify(reference) {
      const { status, payload } = await call(`/transaction/verify/${encodeURIComponent(reference)}`)
      if (status === 404 || (status === 400 && payload.status === false)) return null
      const data = payload.data
      if (status !== 200 || payload.status !== true || !data) throw new PaystackError(`Paystack could not check the payment (HTTP ${status}).`)
      return parseTransaction(data)
    },
  }
}

// Reads the fields the site uses from a Paystack transaction (verify response or webhook data).
export function parseTransaction(data: Record<string, unknown>): TransactionResult | null {
  const { reference, status, amount, currency } = data
  if (typeof reference !== 'string' || typeof status !== 'string' || typeof amount !== 'number' || !Number.isInteger(amount) || typeof currency !== 'string') return null
  return { reference, status, amount, currency: currency.toUpperCase() }
}

// Paystack signs each webhook with an HMAC SHA-512 of the raw body, keyed with the secret key.
// Compared in constant time, so the comparison leaks nothing about the expected value.
export function hasValidSignature(rawBody: Buffer, signature: unknown, secretKey: string) {
  if (typeof signature !== 'string' || !/^[0-9a-f]{128}$/i.test(signature)) return false
  const expected = createHmac('sha512', secretKey).update(rawBody).digest()
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'))
}
