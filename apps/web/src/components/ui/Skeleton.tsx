/**
 * @file Skeleton.tsx
 * @module components/ui/Skeleton
 *
 * Shimmer loading placeholder. Renders a grey animated block that matches
 * the size of the content it is waiting for. Uses the `shimmer` keyframe
 * defined in `globals.css`. Announced to screen readers as a busy region
 * via `aria-busy` on the parent container — the `Skeleton` element itself
 * uses `aria-hidden` to avoid polluting the accessibility tree.
 */

import styles from './Skeleton.module.css';

/**
 * Preset shape variant for the skeleton block.
 *
 * - `text`    — single line of text height (1 em).
 * - `heading` — heading height (1.5 em, 60% width).
 * - `avatar`  — circular block (set explicit `width` / `height` via `style`).
 * - `card`    — full-width block (set explicit `height` via `style`).
 * - `custom`  — no preset styles; use `width` and `height` props directly.
 */
export type SkeletonVariant = 'text' | 'heading' | 'avatar' | 'card' | 'custom';

/**
 * Props accepted by the `Skeleton` component.
 */
export interface SkeletonProps {
  /**
   * Preset shape.
   * @defaultValue `'text'`
   */
  variant?: SkeletonVariant;
  /** CSS width value (e.g. `'120px'`, `'100%'`). Overrides the preset width. */
  width?: string | number;
  /** CSS height value (e.g. `'16px'`, `48`). Overrides the preset height. */
  height?: string | number;
  /** Additional class names applied to the skeleton element. */
  className?: string;
}

/**
 * Animated shimmer loading placeholder.
 *
 * Renders a `<div>` with a shimmer gradient animation. The `aria-hidden`
 * attribute ensures it does not appear in the accessibility tree — wrap a
 * group of skeletons in a container with `aria-busy="true"` and an
 * `aria-label` to communicate loading state to screen readers.
 *
 * @param props - `SkeletonProps` with variant, optional dimensions, and className.
 * @returns A shimmer `<div>` placeholder element.
 */
export function Skeleton({
  variant = 'text',
  width,
  height,
  className = '',
}: SkeletonProps): React.JSX.Element {
  const classes = [styles.skeleton, variant !== 'custom' ? styles[variant] : '', className]
    .filter(Boolean)
    .join(' ');

  const style: React.CSSProperties = {};
  if (width !== undefined) style.width = typeof width === 'number' ? `${width}px` : width;
  if (height !== undefined) style.height = typeof height === 'number' ? `${height}px` : height;

  return <div className={classes} style={style} aria-hidden="true" />;
}
