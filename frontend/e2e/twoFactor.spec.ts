import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { ADMIN, SAMPLE_APP_SECRET, SAMPLE_CODE, SAMPLE_RECOVERY_CODES, logInAsAdmin, mockApi, openAdminMenu } from './support/sampleApi'

// Two-step login (backend services/twoFactor.ts): optional for each admin, with an authenticator app
// or email codes, recovery codes, and a banner suggesting it until it is on.

const banner = (page: Page) => page.getByRole('complementary', { name: 'Protect your account with two-step login' })

async function enterPassword(page: Page) {
  await page.goto('/#admin')
  await page.getByLabel('Email address').fill(ADMIN.email)
  await page.getByLabel('Password', { exact: true }).fill(ADMIN.password)
  await page.getByRole('button', { name: 'Log in' }).click()
}

test.describe('the banner suggesting two-step login', () => {
  test('shows after login, closes with "Not now" until the next login, and leads to the setup', async ({ page }) => {
    const api = await mockApi(page)
    await logInAsAdmin(page)
    await expect(banner(page)).toBeVisible()
    await banner(page).getByRole('button', { name: 'Not now' }).click()
    await expect(banner(page)).toHaveCount(0)
    expect(api.requests.some((r) => r.path === '/api/admin/session/two-factor-prompt/dismiss')).toBe(true)
    // Still closed on another admin page and after reloading.
    await page.getByRole('link', { name: 'Orders' }).click()
    await page.reload()
    await page.getByRole('navigation', { name: 'Admin sections' }).waitFor()
    await expect(banner(page)).toHaveCount(0)
    // Back at the next login.
    await openAdminMenu(page)
    await page.getByRole('button', { name: 'Log out' }).click()
    await logInAsAdmin(page)
    await banner(page).getByRole('link', { name: 'Turn on two-step login' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Two-step login' })).toBeVisible()
    await expect(banner(page)).toHaveCount(0)
  })
})

test.describe('setting up two-step login', () => {
  test('with an authenticator app: QR code and key, a first code, then recovery codes', async ({ page }) => {
    const api = await mockApi(page)
    await logInAsAdmin(page)
    await openAdminMenu(page)
    await page.getByRole('navigation', { name: 'Admin navigation' }).getByRole('link', { name: 'Two-step login' }).click()
    await expect(page.getByRole('heading', { level: 2 })).toContainText('Logging in needs only your password')
    await expect(page.getByRole('radio', { name: /Authenticator app/ })).toBeChecked()
    await page.getByRole('button', { name: 'Continue' }).click()

    await expect(page.getByRole('heading', { level: 2, name: 'Set up your authenticator app' })).toBeFocused()
    const qr = page.getByRole('img', { name: 'QR code to add GPEC Admin to your authenticator app' })
    await expect(qr).toBeVisible()
    // A real QR code: square, with many dark modules.
    expect(await qr.locator('path').getAttribute('d')).toMatch(/^(M\d+ \d+h1v1h-1z){200,}$/)
    await expect(page.locator('.admin-security-key')).toHaveText(SAMPLE_APP_SECRET.match(/.{4}/g)?.join(' ') ?? '')

    // The password is asked for too: a browser left logged in is not enough.
    const password = page.getByLabel('Password', { exact: true })
    await password.fill('not my password at all')
    await page.getByLabel('6-digit code from the app').fill(SAMPLE_CODE)
    await page.getByRole('button', { name: 'Turn on two-step login' }).click()
    await expect(page.getByRole('alert')).toContainText('Your password is incorrect.')
    await expect(password).toHaveAccessibleDescription('Your password is incorrect.')
    await password.fill(ADMIN.password)
    await page.getByLabel('6-digit code from the app').fill('654321')
    await page.getByRole('button', { name: 'Turn on two-step login' }).click()
    await expect(page.getByRole('alert')).toContainText('That code is not right')
    await page.getByLabel('6-digit code from the app').fill(SAMPLE_CODE)
    await page.getByRole('button', { name: 'Turn on two-step login' }).click()

    await expect(page.getByRole('heading', { name: 'Save your recovery codes' })).toBeFocused()
    await expect(page.locator('.admin-recovery-codes li')).toHaveText(SAMPLE_RECOVERY_CODES)
    expect(api.requests.filter((r) => r.path === '/api/admin/account/two-factor/enable').at(-1)?.body).toEqual({ method: 'app', password: ADMIN.password, code: SAMPLE_CODE })
    const done = page.getByRole('button', { name: 'Done' })
    await expect(done).toBeDisabled()
    await page.getByRole('checkbox', { name: 'I have saved my recovery codes somewhere safe.' }).check()
    await done.click()
    await expect(page.getByRole('heading', { level: 2 })).toContainText('Using an authenticator app')
    await expect(page.getByText('Recovery codes left: 10 of 10.')).toBeVisible()
    // No banner once it is on.
    await page.getByRole('link', { name: 'Products' }).click()
    await expect(banner(page)).toHaveCount(0)
  })

  test('with email codes: a code is emailed, then recovery codes', async ({ page }) => {
    const api = await mockApi(page)
    await logInAsAdmin(page)
    await page.goto('/#admin/security')
    await page.getByRole('radio', { name: /Code by email/ }).check()
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page.getByRole('status').filter({ hasText: `A code is on its way to ${ADMIN.email}` })).toBeVisible()
    await page.getByLabel('Password', { exact: true }).fill(ADMIN.password)
    await page.getByLabel('6-digit code from the email').fill(SAMPLE_CODE)
    await page.getByRole('button', { name: 'Turn on two-step login' }).click()
    await expect(page.locator('.admin-recovery-codes li')).toHaveCount(10)
    expect(api.twoFactorMethod).toBe('email')
    expect(api.requests.filter((r) => r.path === '/api/admin/account/two-factor/enable').at(-1)?.body).toEqual({ method: 'email', password: ADMIN.password, code: SAMPLE_CODE })
  })

  test('shows each method as a radio button beside its description, not stretched like a text box', async ({ page }) => {
    await mockApi(page)
    await logInAsAdmin(page)
    await page.goto('/#admin/security')
    for (const method of [/Authenticator app/, /Code by email/]) {
      const radio = await page.getByRole('radio', { name: method }).boundingBox()
      const text = await page.locator('.admin-security-method', { hasText: method }).locator('span').boundingBox()
      expect(radio?.width).toBeLessThan(30)
      // The description starts just right of the radio, inside the same box.
      expect((text?.x ?? 0) - ((radio?.x ?? 0) + (radio?.width ?? 0))).toBeLessThan(30)
    }
  })

  test('offers only what the website has set up', async ({ page }) => {
    await mockApi(page, { twoFactorAvailable: { app: false, email: true } })
    await logInAsAdmin(page)
    await page.goto('/#admin/security')
    await expect(page.getByRole('radio', { name: /Authenticator app/ })).toBeDisabled()
    await expect(page.getByText('Not available yet: the website’s settings for authenticator apps are not in place.')).toBeVisible()
    await expect(page.getByRole('radio', { name: /Code by email/ })).toBeChecked()
  })
})

test.describe('logging in with two-step login on', () => {
  test('asks for the app code after the password', async ({ page }) => {
    await mockApi(page, { twoFactorMethod: 'app', recoveryCodes: [...SAMPLE_RECOVERY_CODES] })
    await enterPassword(page)
    await expect(page.getByRole('heading', { level: 1, name: 'Two-step login' })).toBeFocused()
    await expect(page.getByText('Open your authenticator app')).toBeVisible()
    await expect(page.getByLabel('6-digit code')).toHaveAttribute('autocomplete', 'one-time-code')
    await page.getByLabel('6-digit code').fill('000000')
    await page.getByRole('button', { name: 'Log in' }).click()
    await expect(page.getByRole('alert')).toContainText('4 tries left')
    await page.getByLabel('6-digit code').fill(SAMPLE_CODE)
    await page.getByRole('button', { name: 'Log in' }).click()
    await expect(page.getByRole('navigation', { name: 'Admin sections' })).toBeVisible()
    await expect(banner(page)).toHaveCount(0)
  })

  test('takes a recovery code instead', async ({ page }) => {
    const api = await mockApi(page, { twoFactorMethod: 'app', recoveryCodes: [...SAMPLE_RECOVERY_CODES] })
    await enterPassword(page)
    await page.getByRole('button', { name: 'Use a recovery code instead' }).click()
    await page.getByRole('textbox', { name: 'Recovery code' }).fill(SAMPLE_RECOVERY_CODES[3])
    await page.getByRole('button', { name: 'Log in' }).click()
    await expect(page.getByRole('navigation', { name: 'Admin sections' })).toBeVisible()
    expect(api.requests.find((r) => r.path === '/api/admin/session/two-factor')?.body).toEqual({ recoveryCode: SAMPLE_RECOVERY_CODES[3] })
  })

  test('with email codes, says where the code went and can send a new one', async ({ page }) => {
    await mockApi(page, { twoFactorMethod: 'email', recoveryCodes: [...SAMPLE_RECOVERY_CODES] })
    await enterPassword(page)
    await expect(page.getByText('We have emailed a 6-digit code to a•••@example.com.')).toBeVisible()
    await page.getByRole('button', { name: 'Send a new code' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'A new code is on its way.' })).toBeVisible()
  })

  test('with email codes past the hourly limit, says no new code was sent and offers no new one', async ({ page }) => {
    await mockApi(page, { twoFactorMethod: 'email', recoveryCodes: [...SAMPLE_RECOVERY_CODES], loginEmailLimitReached: true })
    await enterPassword(page)
    await expect(page.getByText('No new code was emailed: several were sent to a•••@example.com in the last hour.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Send a new code' })).toHaveCount(0)
    // The last code sent still works.
    await page.getByLabel('6-digit code').fill(SAMPLE_CODE)
    await page.getByRole('button', { name: 'Log in' }).click()
    await expect(page.getByRole('navigation', { name: 'Admin sections' })).toBeVisible()
  })

  test('when 6-digit codes are paused for the account, switches to a recovery code', async ({ page }) => {
    await mockApi(page, { twoFactorMethod: 'app', recoveryCodes: [...SAMPLE_RECOVERY_CODES], codesPaused: true })
    await enterPassword(page)
    await page.getByLabel('6-digit code').fill(SAMPLE_CODE)
    await page.getByRole('button', { name: 'Log in' }).click()
    await expect(page.getByRole('alert')).toContainText('6-digit codes are paused. Use one of your recovery codes')
    await page.getByRole('textbox', { name: 'Recovery code' }).fill(SAMPLE_RECOVERY_CODES[0])
    await page.getByRole('button', { name: 'Log in' }).click()
    await expect(page.getByRole('navigation', { name: 'Admin sections' })).toBeVisible()
  })

  test('without email, goes straight to a recovery code', async ({ page }) => {
    await mockApi(page, { twoFactorMethod: 'email', recoveryCodes: [...SAMPLE_RECOVERY_CODES], twoFactorAvailable: { app: true, email: false } })
    await enterPassword(page)
    await expect(page.getByText('Codes cannot be emailed right now.')).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Recovery code' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Send a new code' })).toHaveCount(0)
  })

  test('a login that has timed out goes back to the password, saying why', async ({ page }) => {
    const api = await mockApi(page, { twoFactorMethod: 'app', recoveryCodes: [...SAMPLE_RECOVERY_CODES] })
    await enterPassword(page)
    api.pendingLogin = false
    await page.getByLabel('6-digit code').fill(SAMPLE_CODE)
    await page.getByRole('button', { name: 'Log in' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Admin login' })).toBeVisible()
    await expect(page.getByRole('status')).toHaveText('Your login has timed out. Enter your email and password again.')
  })
})

test.describe('managing two-step login', () => {
  test('turning it off needs the password and a code', async ({ page }) => {
    const api = await mockApi(page, { twoFactorMethod: 'app', recoveryCodes: [...SAMPLE_RECOVERY_CODES] })
    await enterPassword(page)
    await page.getByLabel('6-digit code').fill(SAMPLE_CODE)
    await page.getByRole('button', { name: 'Log in' }).click()
    await page.goto('/#admin/security')
    await page.getByRole('button', { name: 'Turn off two-step login' }).click()
    await expect(page.getByRole('heading', { level: 2, name: 'Turn off two-step login' })).toBeFocused()
    await page.getByLabel('Password', { exact: true }).fill('not the password')
    await page.getByLabel('6-digit code from your app').fill(SAMPLE_CODE)
    await page.getByRole('button', { name: 'Turn off two-step login' }).click()
    await expect(page.locator('#security-password-error')).toHaveText('Your password is incorrect.')
    await page.getByLabel('Password', { exact: true }).fill(ADMIN.password)
    await page.getByRole('button', { name: 'Turn off two-step login' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Two-step login is off.' })).toBeVisible()
    expect(api.twoFactorMethod).toBeNull()
  })

  test('makes new recovery codes with a recovery code, and warns when few are left', async ({ page }) => {
    await mockApi(page, { twoFactorMethod: 'app', recoveryCodes: SAMPLE_RECOVERY_CODES.slice(0, 2) })
    await enterPassword(page)
    await page.getByLabel('6-digit code').fill(SAMPLE_CODE)
    await page.getByRole('button', { name: 'Log in' }).click()
    await page.goto('/#admin/security')
    await expect(page.getByText('You are running low on recovery codes.')).toBeVisible()
    await page.getByRole('button', { name: 'Make new recovery codes' }).click()
    await page.getByLabel('Password', { exact: true }).fill(ADMIN.password)
    await page.getByRole('button', { name: 'Use a recovery code instead' }).click()
    await page.getByRole('textbox', { name: 'Recovery code' }).fill(SAMPLE_RECOVERY_CODES[0])
    await page.getByRole('button', { name: 'Make new recovery codes' }).click()
    await expect(page.locator('.admin-recovery-codes li').first()).toHaveText('wxyz0-efgh0')
  })
})
