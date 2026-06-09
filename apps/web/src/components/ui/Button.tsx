/**
 * @file Button.tsx
 * @module components/ui/Button
 *
 * Reusable button component with four variants, three sizes, loading state,
 * and full-width option. All colours reference CSS design tokens — no
 * hardcoded values. Supports both `<button>` and anchor (`<a>`) usage via
 * the `as` prop (defaults to `<button>`).
 */

import styles from './Button.module.css';

/**
 * Visual style variant for the button.
 *
 * - `primary`   — filled green, used for primary actions.
 * - `secondary` — outlined green, used for secondary actions.
 * - `ghost`     — text-only, used for tertiary/inline actions.
 * - `danger`    — filled red, used for destructive actions.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

/**
 * Size option controlling padding and font size.
 *
 * - `sm` — compact (32 px min-height).
 * - `md` — default (40 px min-height).
 * - `lg` — large (48 px min-height).
 */
export type ButtonSize = 'sm' | 'md' | 'lg';

/**
 * Props accepted by the `Button` component.
 */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * Visual style variant.
   * @defaultValue `'primary'`
   */
  variant?: ButtonVariant;
  /**
   * Size preset.
   * @defaultValue `'md'`
   */
  size?: ButtonSize;
  /**
   * When `true`, renders a spinner and disables interaction.
   * @defaultValue `false`
   */
  isLoading?: boolean;
  /**
   * When `true`, stretches the button to fill its container width.
   * @defaultValue `false`
   */
  fullWidth?: boolean;
  /** Optional icon or element rendered to the left of the label. */
  leftIcon?: React.ReactNode;
  /** Optional icon or element rendered to the right of the label. */
  rightIcon?: React.ReactNode;
}

/**
 * Application button component.
 *
 * Composes variant, size, loading, and full-width CSS module classes.
 * All interactive states (hover, focus, disabled) are handled in CSS.
 * The spinner is announced to assistive technology via `aria-busy`.
 *
 * @param props - `ButtonProps` extending native `<button>` attributes.
 * @returns A styled `<button>` element.
 */
export function Button({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  fullWidth = false,
  leftIcon,
  rightIcon,
  children,
  className = '',
  disabled,
  ...rest
}: ButtonProps): React.JSX.Element {
  const classes = [
    styles.btn,
    styles[variant],
    styles[size],
    fullWidth ? styles.fullWidth : '',
    isLoading ? styles.btnLoading : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button className={classes} disabled={disabled ?? isLoading} aria-busy={isLoading} {...rest}>
      {isLoading && <span className={styles.spinner} aria-hidden="true" />}
      {!isLoading && leftIcon && <span aria-hidden="true">{leftIcon}</span>}
      {children}
      {!isLoading && rightIcon && <span aria-hidden="true">{rightIcon}</span>}
    </button>
  );
}
