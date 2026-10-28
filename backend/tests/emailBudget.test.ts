import { describe, expect, it } from 'vitest'
import { EmailBudget } from '../src/utils/emailBudget.js'

// Audit L-02: the per-address email caps keep an address only while it counts, never readably, and
// never more than a set number of them.
describe('the per-address email count', () => {
  const HOUR = 60 * 60 * 1000

  function budget(perWindow = 3, maxAddresses = 10_000) {
    let now = 1_000_000
    const counter = new EmailBudget(perWindow, HOUR, maxAddresses, () => now)
    return { counter, wait: (ms: number) => { now += ms } }
  }

  it('allows the set number an hour per address, however the address is written', () => {
    const { counter, wait } = budget()
    expect([1, 2, 3].map(() => counter.take('ada@example.com'))).toEqual([true, true, true])
    expect(counter.take(' ADA@example.com ')).toBe(false)
    expect(counter.take('other@example.com')).toBe(true)
    wait(HOUR)
    expect(counter.take('ada@example.com')).toBe(true)
  })

  // Swept at most every quarter of an hour, so an address goes within 15 minutes after its hour is up.
  it('forgets an address once its hour is up, even if it is never used again', () => {
    const { counter, wait } = budget()
    for (let i = 0; i < 50; i++) counter.take(`visitor${i}@example.com`)
    expect(counter.size).toBe(50)
    wait(HOUR - 1)
    counter.take('late@example.com')
    expect(counter.size).toBe(51)
    wait(HOUR / 4 + 1)
    counter.take('later@example.com')
    // The fifty from over an hour ago are gone; the two recent ones stay.
    expect(counter.size).toBe(2)
  })

  it('never holds more than its ceiling, dropping the address emailed longest ago', () => {
    const { counter, wait } = budget(3, 100)
    for (let i = 0; i < 100; i++) { counter.take(`visitor${i}@example.com`); wait(1) }
    // The first one is emailed again, so it is now the most recent.
    counter.take('visitor0@example.com')
    for (let i = 0; i < 500; i++) counter.take(`flood${i}@example.com`)
    expect(counter.size).toBe(100)
    // visitor0 was pushed out by the flood like the rest, so its count started again; a recent one keeps its count.
    expect([1, 2].map(() => counter.take('flood499@example.com'))).toEqual([true, true])
    expect(counter.take('flood499@example.com')).toBe(false)
  })

  it('keeps a fingerprint, never the address, and one that differs each time the server starts', () => {
    const first = budget().counter
    const second = budget().counter
    first.take('ada@example.com')
    second.take('ada@example.com')
    const [fingerprint] = first.fingerprints()
    expect(fingerprint).not.toContain('ada')
    expect(fingerprint).not.toContain('example')
    expect(fingerprint).not.toBe(second.fingerprints()[0])
  })
})
