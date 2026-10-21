import { defineConfig } from '@playwright/test'

// Browser tests (e2e/) run against the production build, served by `vite preview`, which Playwright
// starts and stops itself. Every API call is answered by e2e/support/sampleApi.ts inside the browser,
// so the backend and database are not needed.
const PORT = 4173
const isCI = !!process.env.CI

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', testIgnore: /contrast\.spec\.ts/, use: { viewport: { width: 1440, height: 900 } } },
    { name: 'phone', testIgnore: /contrast\.spec\.ts/, use: { viewport: { width: 390, height: 844 }, hasTouch: true } },
    // Text contrast in every page and state (both widths are inside the spec). Slow: about a minute.
    { name: 'contrast', testMatch: /contrast\.spec\.ts/, timeout: 10 * 60_000 },
  ],
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !isCI,
    timeout: 180_000,
  },
})
