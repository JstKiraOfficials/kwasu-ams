const base = require('./base');

/** @type {import('eslint').Linter.Config} */
module.exports = {
  ...base,
  env: {
    node: true,
    es2022: true,
  },
  extends: [...(base.extends ?? []), 'plugin:node/recommended'],
  rules: {
    ...base.rules,
    'no-console': 'warn',
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
    ],
  },
};
