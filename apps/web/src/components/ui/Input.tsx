/**
 * @file Input.tsx
 * @module components/ui/Input
 *
 * Accessible text input component with a paired `<label>`, optional helper
 * text, error state with `aria-describedby`, and a show/hide toggle for
 * password fields. Validates on blur and submit, not on every keystroke,
 * per project auth rules.
 *
 * Every instance must receive either `label` (visible) or `aria-label`
 * (screen-reader only) — bare inputs without labels are not permitted.
 */

'use client';

import { useState, useId } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import styles from './Input.module.css';

/**
 * Props accepted by the `Input` component.
 */
export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'id'> {
  /** Visible label text rendered in a `<label>` element above the input. */
  label?: string;
  /**
   * Error message displayed below the input and linked via `aria-describedby`.
   * When provided, the input receives the error border colour.
   */
  error?: string;
  /**
   * Helper text displayed below the input when there is no error.
   * Ignored when `error` is set.
   */
  helperText?: string;
  /**
   * When `true`, stretches the input to fill its container.
   * @defaultValue `true`
   */
  fullWidth?: boolean;
  /** Additional class names applied to the wrapper `<div>`. */
  className?: string;
}

/**
 * Form text input component.
 *
 * Generates stable IDs via `useId` so the `<label>` and error/helper text are
 * always correctly associated. Password inputs automatically receive an
 * eye-icon toggle button that switches `type` between `password` and `text`.
 *
 * @param props - `InputProps` extending native `<input>` attributes (minus `id`).
 * @returns A labelled input field with optional error and helper text.
 */
export function Input({
  label,
  error,
  helperText,
  fullWidth = true,
  className = '',
  type,
  ...rest
}: InputProps): React.JSX.Element {
  const uid = useId();
  const inputId = `input-${uid}`;
  const errorId = `input-error-${uid}`;
  const helperId = `input-helper-${uid}`;

  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === 'password';
  const resolvedType = isPassword && showPassword ? 'text' : type;

  const descriptionId = error ? errorId : helperText ? helperId : undefined;

  const wrapperClasses = [styles.wrapper, fullWidth ? styles.fullWidth : '', className]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={wrapperClasses}>
      {label && (
        <label htmlFor={inputId} className={styles.label}>
          {label}
        </label>
      )}

      <div className={styles.inputWrap}>
        <input
          id={inputId}
          type={resolvedType}
          className={`${styles.input} ${error ? styles.inputError : ''} ${isPassword ? styles.inputPadRight : ''}`}
          aria-describedby={descriptionId}
          aria-invalid={error ? true : undefined}
          {...rest}
        />

        {isPassword && (
          <button
            type="button"
            className={styles.eyeBtn}
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            tabIndex={0}
          >
            {showPassword ? (
              <EyeOff size={16} strokeWidth={1.75} aria-hidden="true" />
            ) : (
              <Eye size={16} strokeWidth={1.75} aria-hidden="true" />
            )}
          </button>
        )}
      </div>

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
