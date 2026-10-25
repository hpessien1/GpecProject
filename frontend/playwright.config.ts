import { defineConfig } from '@playwright/test'

// Browser tests (e2e/) run against the production build, served by `vite preview`, which Playwright
// starts and stops itself. Every API call is answered by e2e/support/sampleApi.ts inside the browser,
// so the backend and database are not needed.
const PORT = 4173
const isCI = !!process.env.CI

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // Playwright's default is one browser per two CPU cores (11 on the developer's laptop). Four keep
  // memory in check there, where full test runs have frozen the machine (2026-10-26); CI keeps the
  // default.
  workers: isCI ? undefined : 4,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    // Text contrast in every page and state (both widths are inside the spec), in 14 parts of up to
    // about a minute each. Listed first, so the longest tests start first and the quick behaviour
    // tests fill in around them, instead of a long test starting last and holding up the run.
    { name: 'contrast', testMatch: /contrast\.spec\.ts/, timeout: 5 * 60_000 },
    { name: 'desktop', testIgnore: /contrast\.spec\.ts/, use: { viewport: { width: 1440, height: 900 } } },
    { name: 'phone', testIgnore: /contrast\.spec\.ts/, use: { viewport: { width: 390, height: 844 }, hasTouch: true } },
  ],
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !isCI,
    timeout: 180_000,
  },
})
