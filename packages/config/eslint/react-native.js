const base = require('./base');

/** @type {import('eslint').Linter.Config} */
module.exports = {
  ...base,
  extends: [...(base.extends ?? []), '@react-native-community'],
  rules: {
    ...base.rules,
    'react-native/no-inline-styles': 'warn',
  },
};
