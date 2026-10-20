import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // The first run downloads a MongoDB binary for mongodb-memory-server.
    hookTimeout: 120_000,
  },
})
