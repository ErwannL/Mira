import { defineConfig } from 'vitest/config';

// End-to-end tests: need `npm run build` (UI bundle) and a Postgres (TEST_DATABASE_URL).
export default defineConfig({
  test: {
    include: ['e2e/**/*.e2e.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
