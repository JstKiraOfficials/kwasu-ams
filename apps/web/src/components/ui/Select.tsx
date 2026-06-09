/**
 * @file Select.tsx
 * @module components/ui/Select
 *
 * Accessible `<select>` dropdown styled to match the `Input` component.
 * Every instance must receive a `label` or an `aria-label`. Error messages
 * are linked via `aria-describedby` for screen-reader compatibility.
 */

import { useId } from 'react';
import styles from './Select.module.css';

/**
 * A single option entry for the `<select>` element.
 */
export interface SelectOption {
  /** The `value` attribute submitted with the form. */
  value: string;
  /** The human-readable label displayed in the dropdown. */
  label: string;
  /** When `true`, the option cannot be selected. */
  disabled?: boolean;
}

/**
 * Props accepted by the `Select` component.
 */
export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'id'> {
  /** Visible label rendered in a `<label>` element above the select. */
  label?: string;
  /** Array of options to render inside the `<select>`. */
  options: SelectOption[];
  /**
   * Error message displayed below the select and linked via `aria-describedby`.
   * When provided, the select receives the error border colour.
   */
  error?: string;
  /**
   * Helper text displayed below the select when there is no error.
   * Ignored when `error` is set.
   */
  helperText?: string;
  /**
   * Placeholder option shown when no value is selected.
   * Rendered as a disabled first option.
   */
  placeholder?: string;
  /**
   * When `true`, stretches the select to fill its container.
   * @defaultValue `true`
   */
  fullWidth?: boolean;
  /** Additional class names applied to the wrapper `<div>`. */
  className?: string;
}

/**
 * Form select (dropdown) component.
 *
 * Uses `useId` to generate stable IDs for label association and
 * `aria-describedby` linkage. Styled identically to `Input`.
 *
 * @param props - `SelectProps` extending native `<select>` attributes (minus `id`).
 * @returns A labelled select element with optional placeholder, error, and helper text.
 */
export function Select({
  label,
  options,
  error,
  helperText,
  placeholder,
  fullWidth = true,
  className = '',
  ...rest
}: SelectProps): React.JSX.Element {
  const uid = useId();
  const selectId = `select-${uid}`;
  const errorId = `select-error-${uid}`;
  const helperId = `select-helper-${uid}`;

  const descriptionId = error ? errorId : helperText ? helperId : undefined;

  const wrapperClasses = [styles.wrapper, fullWidth ? styles.fullWidth : '', className]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={wrapperClasses}>
      {label && (
        <label htmlFor={selectId} className={styles.label}>
          {label}
        </label>
      )}

      <select
        id={selectId}
        className={`${styles.select} ${error ? styles.selectError : ''}`}
        aria-describedby={descriptionId}
        aria-invalid={error ? true : undefined}
        {...rest}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </option>
        ))}
      </select>

      {error && (
        <span id={errorId} className={styles.errorText} role="alert">
          {error}
        </span>
      )}
      {!error && helperText && (
        <span id={helperId} className={styles.helperText}>
          {helperText}
        </span>
      )}
    </div>
  );
}
