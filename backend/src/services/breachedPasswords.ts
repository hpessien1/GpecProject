import { createHash } from 'node:crypto'

// Whether a password is known from a data breach (NIST SP 800-63B asks for this check on new
// passwords). Answers null when the check could not be made. Production uses Pwned Passwords; tests
// pass a stand-in, so they never reach the internet.
export interface BreachedPasswordCheck {
  isBreached(password: string): Promise<boolean | null>
}

const RANGE_URL = 'https://api.pwnedpasswords.com/range/'
const TIMEOUT_MS = 3000

// Have I Been Pwned's free Pwned Passwords API (no key, no rate limit, no attribution required;
// approved by the user 2026-10-22). k-anonymity: only the first 5 characters of the password's SHA-1
// hash are sent, and the reply lists every breached hash starting with them, so the service never
// learns which password was checked. Padding adds random fake entries (count 0) so even the reply's
// size reveals nothing.
export function pwnedPasswordsCheck(fetchImpl: typeof fetch = fetch): BreachedPasswordCheck {
  return {
    async isBreached(password) {
      const hash = createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase()
      const prefix = hash.slice(0, 5)
      const suffix = hash.slice(5)
      try {
        const res = await fetchImpl(`${RANGE_URL}${prefix}`, {
          headers: { 'User-Agent': 'GPEC-website', 'Add-Padding': 'true' },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        })
        if (!res.ok) return null
        for (const line of (await res.text()).split('\n')) {
          const [lineSuffix, count] = line.trim().split(':')
          if (lineSuffix === suffix) return Number(count) > 0
        }
        return false
      } catch {
        // Network failure or timeout: the caller decides what to do without the check.
        return null
      }
    },
  }
}
