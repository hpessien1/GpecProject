import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { pwnedPasswordsCheck } from '../src/services/breachedPasswords.js'

// SHA-1 of "password" is 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8: prefix 5BAA6, then the suffix.
const SUFFIX = '1E4C9B93F3F0682250B6CF8331B7EE68FD8'

// A stand-in for fetch that records what was asked and answers with the given body or failure.
function fakeFetch(answer: { body?: string, status?: number, fail?: boolean }) {
  const calls: { url: string, headers: Record<string, string> }[] = []
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, headers: init?.headers as Record<string, string> })
    if (answer.fail) throw new TypeError('fetch failed')
    return new Response(answer.body ?? '', { status: answer.status ?? 200 })
  }) as typeof fetch
  return { calls, check: pwnedPasswordsCheck(fetchImpl) }
}

describe('Pwned Passwords check', () => {
  it('sends only the first 5 hash characters, with padding and a user agent', async () => {
    const secret = 'copper lantern river seven'
    const hash = createHash('sha1').update(secret).digest('hex').toUpperCase()
    const { calls, check } = fakeFetch({ body: '' })
    await check.isBreached(secret)
    expect(calls).toEqual([{ url: `https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`, headers: { 'User-Agent': 'GPEC-website', 'Add-Padding': 'true' } }])
    expect(JSON.stringify(calls)).not.toContain('copper')
    expect(JSON.stringify(calls)).not.toContain(hash.slice(5))
  })

  it('finds a breached password among the returned hashes', async () => {
    const { check } = fakeFetch({ body: `0018A45C4D1DEF81644B54AB7F969B88D65:1\r\n${SUFFIX}:10434004\r\n00D4F6E8FA6EECAD2A3AA415EEC418D38EC:2` })
    expect(await check.isBreached('password')).toBe(true)
  })

  it('treats a padding entry (count 0) and an absent hash as not breached', async () => {
    expect(await fakeFetch({ body: `${SUFFIX}:0\r\n0018A45C4D1DEF81644B54AB7F969B88D65:1` }).check.isBreached('password')).toBe(false)
    expect(await fakeFetch({ body: '0018A45C4D1DEF81644B54AB7F969B88D65:1' }).check.isBreached('password')).toBe(false)
  })

  it('answers null when the service fails or cannot be reached', async () => {
    expect(await fakeFetch({ status: 503 }).check.isBreached('password')).toBeNull()
    expect(await fakeFetch({ fail: true }).check.isBreached('password')).toBeNull()
  })
})
