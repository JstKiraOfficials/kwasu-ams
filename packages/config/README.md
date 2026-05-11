# @kwasu-ams/config

Shared configuration presets for all apps and packages in the KWASU AMS monorepo.
These files are consumed directly by reference — this package has no build step.

## TypeScript Presets

| File                         | Used by                                           |
| ---------------------------- | ------------------------------------------------- |
| `tsconfig/base.json`         | All packages (`packages/types`, `packages/utils`) |
| `tsconfig/node.json`         | `apps/api`                                        |
| `tsconfig/nextjs.json`       | `apps/web`                                        |
| `tsconfig/react-native.json` | `apps/mobile`                                     |

### Extending in a package

```json
{
  "extends": "@kwasu-ams/config/tsconfig/base.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist"
  }
}
```

### Extending in an app

```json
{
  "extends": "@kwasu-ams/config/tsconfig/node.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  }
}
```

## ESLint Presets

| File                     | Used by       |
| ------------------------ | ------------- |
| `eslint/base.js`         | All packages  |
| `eslint/node.js`         | `apps/api`    |
| `eslint/nextjs.js`       | `apps/web`    |
| `eslint/react-native.js` | `apps/mobile` |

### Extending in a package

```js
module.exports = {
  ...require('@kwasu-ams/config/eslint/base'),
  parserOptions: {
    project: true,
    tsconfigRootDir: __dirname,
  },
};
```

## Prettier Preset

```js
// prettier.config.js
module.exports = require('@kwasu-ams/config/prettier');
```
