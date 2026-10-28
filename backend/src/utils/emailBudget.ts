import { createHmac, randomBytes } from 'node:crypto'

// How many emails each address was sent recently, for the per-address hourly caps (customer
// confirmations, password-reset links), so the forms cannot be used to flood someone's inbox. In
// memory: one API instance only (CLAUDE.md, Section 6.3).
// Audit L-02: an address is kept only while it counts, and never readably. Each is held as a
// fingerprint (an HMAC with a key made at startup and never stored, so a list of guessed addresses
// cannot be checked against it); entries whose time is up are swept away; and at most maxAddresses
// are held, the one emailed longest ago dropped first, so the memory used has a ceiling.
export class EmailBudget {
  private readonly sent = new Map<string, number[]>()
  private readonly key = randomBytes(32)
  private lastSweep: number

  constructor(
    private readonly perWindow: number,
    private readonly windowMs: number,
    private readonly maxAddresses = 10_000,
    private readonly now: () => number = Date.now,
  ) {
    this.lastSweep = now()
  }

  // How many addresses are held (for tests).
  get size() {
    return this.sent.size
  }

  // What is held for an address (for tests: the fingerprint, never the address).
  fingerprints() {
    return [...this.sent.keys()]
  }

  // True, and counted, when one more email may go to this address now.
  take(address: string) {
    const now = this.now()
    if (now - this.lastSweep >= this.windowMs / 4) this.sweep(now)
    const id = createHmac('sha256', this.key).update(address.trim().toLowerCase()).digest('base64url')
    const recent = (this.sent.get(id) ?? []).filter((time) => now - time < this.windowMs)
    if (recent.length >= this.perWindow) return false
    // Added again at the end, so the first entry is always the one emailed longest ago.
    this.sent.delete(id)
    const oldest = this.sent.size >= this.maxAddresses ? this.sent.keys().next().value : undefined
    if (oldest !== undefined) this.sent.delete(oldest)
    this.sent.set(id, [...recent, now])
    return true
  }

  private sweep(now: number) {
    for (const [id, times] of this.sent) {
      if (times.every((time) => now - time >= this.windowMs)) this.sent.delete(id)
    }
    this.lastSweep = now
  }
}
