const base = require('./base');

/** @type {import('eslint').Linter.Config} */
module.exports = {
  ...base,
  extends: [...(base.extends ?? []), 'plugin:node/recommended'],
  rules: {
    ...base.rules,
    'no-console': 'warn',
  },
};
