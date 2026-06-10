'use client';

/**
 * @file LoginForm.tsx
 * @module components/auth
 *
 * Login form component for the KWASU AMS web application.
 *
 * Renders a single identifier input that auto-detects whether the value is a
 * matric number (student) or staff ID (staff) by testing both regexes. There
 * is no tab selector — the form works for all user types with a neutral label
 * so students are unaware that staff use the same form.
 *
 * Validation fires on field blur and form submit — not on every keystroke.
 * Identifier format is validated client-side before any API call.
 */

import { useState, useCallback, type FormEvent, type ReactElement } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { MATRIC_NUMBER_REGEX, STAFF_ID_REGEX } from '@kwasu-ams/utils';
import { apiPost, ApiError, setAccessToken } from '@/lib/api-client';
import { useAuthFlow } from '@/providers/auth-flow-provider';
import styles from './LoginForm.module.css';

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Shape of the response returned by `POST /auth/login`.
 */
interface LoginResponse {
  /** Short-lived interim token used to proceed through the auth flow. */
  interimToken: string;
  /** Whether the user must change their password before accessing the system. */
  mustChangePassword: boolean;
  /** Whether the user has completed TOTP enrollment. */
  totpEnrolled: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns `true` if the trimmed value matches either the matric number or
 * staff ID regex — i.e. it is a valid KWASU identifier of any type.
 *
 * @param value - The trimmed identifier string to test.
 * @returns `true` if the value is a valid identifier format.
 */
function isValidIdentifier(value: string): boolean {
  return MATRIC_NUMBER_REGEX.test(value) || STAFF_ID_REGEX.test(value);
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Login form for the KWASU AMS web application.
 *
 * Features:
 * - Single identifier input — no tab selector. Auto-detects student vs staff
 *   by testing the value against both regexes. Students see a neutral label
 *   and are unaware that staff use the same form.
 * - Password field with show/hide toggle.
 * - Loading state with spinner during API call.
 * - Interim token stored in memory only (never in localStorage or cookies).
 * - Redirects based on `mustChangePassword` and `totpEnrolled` flags.
 *
 * @returns The rendered login form element.
 */
export function LoginForm(): ReactElement {
  const router = useRouter();
  const { setInterimToken } = useAuthFlow();

  // ── Field state ───────────────────────────────────────────────────────────
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // ── Error state ───────────────────────────────────────────────────────────
  const [identifierError, setIdentifierError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [formError, setFormError] = useState('');

  // ── Submission state ──────────────────────────────────────────────────────
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── Validation ────────────────────────────────────────────────────────────

  /**
   * Validates the identifier field against both the matric number and staff ID
   * regexes. The error message intentionally does not distinguish between the
   * two formats so students cannot infer that a staff format exists.
   *
   * @returns `true` if valid, `false` if an error was set.
   */
  const validateIdentifier = useCallback((): boolean => {
    const trimmed = identifier.trim();
    if (!trimmed) {
      setIdentifierError('ID is required.');
      return false;
    }
    if (!isValidIdentifier(trimmed)) {
      setIdentifierError('Invalid ID format. Please check and try again.');
      return false;
    }
    setIdentifierError('');
    return true;
  }, [identifier]);

  /**
   * Validates the password field.
   *
   * @returns `true` if valid, `false` if an error was set.
   */
  const validatePassword = useCallback((): boolean => {
    if (!password) {
      setPasswordError('Password is required.');
      return false;
    }
    setPasswordError('');
    return true;
  }, [password]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  /**
   * Fires identifier validation on blur (only when the field has a value).
   */
  const handleIdentifierBlur = useCallback((): void => {
    if (identifier.trim()) validateIdentifier();
  }, [identifier, validateIdentifier]);

  /**
   * Fires password validation on blur (only when the field has a value).
   */
  const handlePasswordBlur = useCallback((): void => {
    if (password) validatePassword();
  }, [password, validatePassword]);

  /**
   * Handles form submission. Validates both fields, calls `POST /auth/login`,
   * stores the interim token in memory, then redirects based on the account
   * state flags returned by the API.
   *
   * @param e - The form submit event.
   */
  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>): Promise<void> => {
      e.preventDefault();
      setFormError('');

      const idValid = validateIdentifier();
      const pwValid = validatePassword();
      if (!idValid || !pwValid) return;

      setIsSubmitting(true);
      try {
        const data = await apiPost<LoginResponse>('/auth/login', {
          identifier: identifier.trim(),
          password,
        });

        // Store interim token in AuthFlowContext AND as the in-memory access token
        // so api-client sends it as Authorization: Bearer on subsequent auth flow calls.
        setInterimToken(data.interimToken);
        setAccessToken(data.interimToken);

        if (data.mustChangePassword) {
          router.push('/change-password');
        } else if (!data.totpEnrolled) {
          router.push('/setup-totp');
        } else {
          router.push('/verify-totp');
        }
      } catch (err) {
        if (err instanceof ApiError) {
          setFormError(err.message);
        } else {
          setFormError('An unexpected error occurred. Please try again.');
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [identifier, password, validateIdentifier, validatePassword, router],
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <form
      className={styles.form}
      onSubmit={(e) => {
        void handleSubmit(e);
      }}
      noValidate
    >
      <h1 className={styles.heading}>Sign in to KWASU AMS</h1>

      {/* Identifier field — neutral label, no tab selector */}
      <div className={styles.fieldGroup}>
        <label htmlFor="identifier" className={styles.label}>
          Matric Number
        </label>
        <input
          id="identifier"
          type="text"
          autoComplete="username"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="e.g. 22/47CS/00001"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          onBlur={handleIdentifierBlur}
          className={`${styles.input} ${identifierError ? styles.inputError : ''}`}
          aria-describedby={identifierError ? 'identifier-error' : undefined}
          aria-invalid={identifierError ? true : undefined}
          disabled={isSubmitting}
        />
        {identifierError && (
          <span id="identifier-error" className={styles.fieldError} role="alert">
            {identifierError}
          </span>
        )}
      </div>

      {/* Password field */}
      <div className={styles.fieldGroup}>
        <label htmlFor="password" className={styles.label}>
          Password
        </label>
        <div className={styles.inputWrapper}>
          <input
            id="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onBlur={handlePasswordBlur}
            className={`${styles.input} ${styles.inputWithToggle} ${passwordError ? styles.inputError : ''}`}
            aria-describedby={passwordError ? 'password-error' : undefined}
            aria-invalid={passwordError ? true : undefined}
            disabled={isSubmitting}
          />
          <button
            type="button"
            className={styles.toggleButton}
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            tabIndex={-1}
          >
            {showPassword ? (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            ) : (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        </div>
        {passwordError && (
          <span id="password-error" className={styles.fieldError} role="alert">
            {passwordError}
          </span>
        )}
      </div>

      {/* Form-level error */}
      {formError && (
        <div className={styles.formError} role="alert">
          {formError}
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        className={styles.submitButton}
        disabled={isSubmitting}
        aria-busy={isSubmitting}
      >
        {isSubmitting && <span className={styles.spinner} aria-hidden="true" />}
        {isSubmitting ? 'Signing in…' : 'Sign In'}
      </button>

      <Link href="/forgot-password" className={styles.forgotLink}>
        Forgot password?
      </Link>
    </form>
  );
}
