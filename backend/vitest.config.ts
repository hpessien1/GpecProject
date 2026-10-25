import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // The first run downloads a MongoDB binary for mongodb-memory-server.
    hookTimeout: 120_000,
    // Each test file starts its own in-memory MongoDB. Vitest's default (one file per CPU core) took
    // the developer's laptop to about 24 GB and froze it (2026-10-26); four at a time peaked at
    // 2.5 GB and took 90 s. CI keeps the default: its runners are separate machines.
    maxWorkers: process.env.CI ? undefined : 4,
  },
})
