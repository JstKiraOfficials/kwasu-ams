/**
 * @file css.d.ts
 * @module types/css
 *
 * Ambient module declarations for CSS and CSS Module imports.
 *
 * - Wildcard `*.module.css` declaration ensures TypeScript accepts CSS Module
 *   imports and types them as `Record<string, string>`.
 * - Plain `*.css` declaration covers global stylesheet side-effect imports
 *   (e.g. `import '../styles/globals.css'` in the root layout).
 */

/** CSS Modules — each class name maps to a scoped string identifier. */
declare module '*.module.css' {
  const classes: Record<string, string>;
  export default classes;
}

/** Plain CSS side-effect imports (global stylesheets). */
declare module '*.css' {
  const content: Record<string, string>;
  export default content;
}
