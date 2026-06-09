/**
 * @file ProgressBar.tsx
 * @module components/ui/ProgressBar
 *
 * Horizontal progress bar with optional colour-coded fill, threshold markers,
 * and a percentage label. Meets WCAG 2.1 requirements by using
 * `role="progressbar"` with `aria-valuenow`, `aria-valuemin`, and
 * `aria-valuemax`. Colour is never the sole status indicator — the optional
 * `label` prop provides a text equivalent.
 *
 * The only permitted inline style in this component is `style={{ width }}`
 * on the fill element — a dynamic value that cannot be expressed as a static
 * CSS class.
 */

import styles from './ProgressBar.module.css';

/**
 * Colour variant for the progress fill.
 *
 * - `auto`    — automatically picks safe / warning / danger based on `value`.
 * - `primary` — always KWASU green.
 * - `safe`    — always attendance-safe green.
 * - `warning` — always attendance-warning amber.
 * - `danger`  — always attendance-danger red.
 */
export type ProgressBarVariant = 'auto' | 'primary' | 'safe' | 'warning' | 'danger';

/**
 * A threshold marker line drawn on the track at a given percentage.
 */
export interface ProgressThreshold {
  /**
   * Position on the track (0–100).
   */
  value: number;
  /** Accessible label for the threshold marker (e.g. `'NUC minimum 75%'`). */
  label: string;
}

/**
 * Props accepted by the `ProgressBar` component.
 */
export interface ProgressBarProps {
  /**
   * Current value (0–100).
   */
  value: number;
  /**
   * Colour variant for the fill.
   * When `'auto'`, the fill uses attendance colour tokens:
   * ≥ 80 % → safe, 75–79 % → warning, < 75 % → danger.
   * @defaultValue `'auto'`
   */
  variant?: ProgressBarVariant;
  /**
   * Optional threshold marker lines drawn on the track.
   * Each marker shows a vertical line at the given percentage position.
   */
  thresholds?: ProgressThreshold[];
  /**
   * When `true`, renders the percentage value as text to the right of the bar.
   * @defaultValue `false`
   */
  showLabel?: boolean;
  /**
   * Accessible label describing what the progress bar measures
   * (e.g. `'Attendance percentage for BIO 201'`).
   */
  ariaLabel?: string;
  /** Additional class names applied to the wrapper `<div>`. */
  className?: string;
}

/**
 * Resolves the CSS module fill class for the given variant and value.
 *
 * @param variant - The configured variant.
 * @param value   - The numeric progress value (0–100).
 * @returns The CSS module class name for the fill colour.
 */
function resolveFillClass(
  variant: ProgressBarVariant,
  value: number,
  moduleStyles: Record<string, string>,
): string {
  if (variant !== 'auto') return moduleStyles[variant] ?? '';
  if (value >= 80) return moduleStyles['safe'] ?? '';
  if (value >= 75) return moduleStyles['warning'] ?? '';
  return moduleStyles['danger'] ?? '';
}

/**
 * Horizontal progress bar component.
 *
 * The fill width is set via `style={{ width: '…%' }}` — the only permitted
 * inline style in the web app (a dynamic value that cannot be a static class).
 * All other styling uses CSS modules.
 *
 * @param props - `ProgressBarProps` controlling value, variant, thresholds, and label.
 * @returns The progress bar JSX element.
 */
export function ProgressBar({
  value,
  variant = 'auto',
  thresholds,
  showLabel = false,
  ariaLabel,
  className = '',
}: ProgressBarProps): React.JSX.Element {
  const clamped = Math.min(100, Math.max(0, value));
  const fillClass = resolveFillClass(variant, clamped, styles as Record<string, string>);

  return (
    <div className={`${styles.wrapper} ${className}`}>
      <div
        className={styles.track}
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={ariaLabel ?? `${clamped.toFixed(1)}% progress`}
      >
        {/* Fill — dynamic width is the sole permitted inline style */}
        <div className={`${styles.fill} ${fillClass}`} style={{ width: `${clamped}%` }} />

        {/* Threshold markers */}
        {thresholds?.map((t) => (
          <div
            key={t.value}
            className={styles.threshold}
            style={{ left: `${t.value}%` }}
            aria-label={t.label}
            title={t.label}
          />
        ))}
      </div>

      {showLabel && <span className={styles.label}>{clamped.toFixed(1)}%</span>}
    </div>
  );
}
