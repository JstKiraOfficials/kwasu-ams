import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import js from '@eslint/js';

/** @type {import('eslint').Linter.FlatConfig[]} */
export default [
  js.configs.recommended,
  // TypeScript-specific rules applied to all TS/TSX files (including test files)
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        // No `project` here — avoids tsconfig resolution issues for test files
        // Type-aware rules are enforced per-package via their own eslint configs
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...tseslint.configs['recommended'].rules,
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'no-console': 'warn',
      // Disable the redundant core rule — @typescript-eslint/no-unused-vars covers it
      'no-unused-vars': 'off',
      // Disable no-undef for TypeScript files — TypeScript's compiler enforces this
      // more accurately via strict type-checking. The rule produces false positives for
      // Node.js globals (process, Buffer), Web APIs (fetch, AbortController), and
      // ambient type declarations from @types/node. This is the standard recommendation
      // for TypeScript + ESLint projects.
      'no-undef': 'off',
    },
  },
  {
    ignores: ['**/dist/**', '**/.next/**', '**/node_modules/**', 'packages/config/**'],
  },
];
