const base = require('./base');

/** @type {import('eslint').Linter.Config} */
module.exports = {
  ...base,
  extends: [...(base.extends ?? []), 'next/core-web-vitals'],
  rules: {
    ...base.rules,
    'react/no-inline-styles': 'error',
    'no-restricted-syntax': [
      'error',
      {
        selector: 'JSXAttribute[name.name="style"]',
        message: 'Inline styles are not permitted. Use CSS Modules with var(--token-name) instead.',
      },
      {
        selector: "ImportDeclaration[source.value='styled-components']",
        message: 'CSS-in-JS via styled-components is not permitted. Use CSS Modules instead.',
      },
      {
        selector: "ImportDeclaration[source.value='@emotion/react']",
        message: 'CSS-in-JS via @emotion is not permitted. Use CSS Modules instead.',
      },
      {
        selector: "ImportDeclaration[source.value='@emotion/styled']",
        message: 'CSS-in-JS via @emotion is not permitted. Use CSS Modules instead.',
      },
    ],
  },
};
