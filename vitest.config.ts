import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['{app,worker,shared,fake-orqea,ui,personas,catalogue}/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      include: ['app/**/*.ts', 'worker/**/*.ts', 'shared/**/*.ts', 'fake-orqea/**/*.ts', 'ui/**/*.ts'],
      // Only logic-free files may be excluded — each is listed with its reason in docs/COVERAGE.md.
      exclude: ['**/*.test.ts', '**/test-helpers/**', '**/*.d.ts', '**/main.ts'],
      thresholds: { perFile: true, statements: 100, branches: 100, functions: 100, lines: 100 },
      reporter: ['text-summary', 'text', 'json-summary'],
    },
  },
});
