/**
 * @file Badge.tsx
 * @module components/ui/Badge
 *
 * Small colour-coded pill used to communicate status or category. Never
 * relies on colour alone — consumers should always pair a badge with a text
 * label so the meaning is accessible to users who cannot distinguish colours.
 */

import styles from './Badge.module.css';

/**
 * Semantic colour variant for the badge.
 *
 * - `success` — green family, used for positive / passing status.
 * - `warning` — amber family, used for borderline / cautionary status.
 * - `danger`  — red family, used for critical / failing status.
 * - `info`    — blue family, used for informational status.
 * - `neutral` — grey, used for inactive or default status.
 */
export type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

/**
 * Props accepted by the `Badge` component.
 */
export interface BadgeProps {
  /**
   * Semantic colour variant.
   * @defaultValue `'neutral'`
   */
  variant?: BadgeVariant;
  /** Optional icon rendered to the left of the label text. */
  icon?: React.ReactNode;
  /** Badge label text. */
  children: React.ReactNode;
  /** Additional class names merged onto the root element. */
  className?: string;
}

/**
 * Status badge component.
 *
 * Renders an inline pill with a semantic background and text colour derived
 * from the chosen variant. Colour is always accompanied by text — the
 * component itself renders its `children` as the visible label.
 *
 * @param props - `BadgeProps` with `variant`, optional `icon`, and `children`.
 * @returns A styled badge `<span>` element.
 */
export function Badge({
  variant = 'neutral',
  icon,
  children,
  className = '',
}: BadgeProps): React.JSX.Element {
  const classes = [styles.badge, styles[variant], className].filter(Boolean).join(' ');

  return (
    <span className={classes}>
      {icon && <span aria-hidden="true">{icon}</span>}
      {children}
    </span>
  );
}
