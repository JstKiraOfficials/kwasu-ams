import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      // Only instrument schemas/ — models/, enums/, and api/ are pure TypeScript
      // type/interface declarations with no executable runtime code to cover.
      include: ['src/schemas/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/schemas/index.ts'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
