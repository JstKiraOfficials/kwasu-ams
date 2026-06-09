/**
 * @file Card.tsx
 * @module components/ui/Card
 *
 * Surface container used for grouping related content. Supports a standard
 * solid-surface variant and a glassmorphism variant with backdrop blur.
 * Only `transform` and `opacity` are animated — never layout properties.
 */

import styles from './Card.module.css';

/**
 * Visual variant for the card surface.
 *
 * - `default` — solid `--color-surface` background with a subtle border and shadow.
 * - `glass`   — semi-transparent background with `backdrop-filter: blur`.
 *               Use sparingly (stat cards, modals, floating panels only).
 */
export type CardVariant = 'default' | 'glass';

/**
 * Props accepted by the `Card` component.
 */
export interface CardProps {
  /**
   * Surface variant.
   * @defaultValue `'default'`
   */
  variant?: CardVariant;
  /**
   * When `true`, removes the default `padding: var(--space-6)` so consumers
   * can apply their own internal padding (e.g. for full-bleed images or tables).
   * @defaultValue `false`
   */
  noPadding?: boolean;
  /** Additional class names merged onto the root element. */
  className?: string;
  /** Card content. */
  children: React.ReactNode;
}

/**
 * Content card component.
 *
 * Renders a `<div>` with the appropriate surface styles. The `glass` variant
 * applies `backdrop-filter` and should only be used on floating/overlay
 * surfaces per the project design guidelines.
 *
 * @param props - `CardProps` controlling variant, padding, and content.
 * @returns A styled card `<div>` element.
 */
export function Card({
  variant = 'default',
  noPadding = false,
  className = '',
  children,
}: CardProps): React.JSX.Element {
  const classes = [
    styles.card,
    variant === 'glass' ? styles.glass : '',
    noPadding ? styles.noPadding : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return <div className={classes}>{children}</div>;
}
