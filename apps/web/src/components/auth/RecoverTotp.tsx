'use client';

/**
 * @file RecoverTotp.tsx
 * @module components/auth
 *
 * TOTP recovery component for the KWASU AMS web application.
 *
 * Allows a user who cannot access their authenticator app to log in using
 * one of their single-use backup recovery codes. Renders a single identifier
 * input that auto-detects student vs staff by testing both regexes — no tab
 * selector is shown. Students are unaware that staff use the same form.
 *
 * On success, calls `AuthProvider.login` with the returned access token and
 * redirects to `/dashboard`.
 *
 * Validation fires on field blur and form submit — not on every keystroke.
 */

import { useState, useCallback, type FormEvent, type ReactElement } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { MATRIC_NUMBER_REGEX, STAFF_ID_REGEX } from '@kwasu-ams/utils';
import { apiPost, ApiError } from '@/lib/api-client';
import { useAuth } from '@/providers/auth-provider';
import styles from './RecoverTotp.module.css';

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Shape of the response returned by `POST /auth/recover-totp`.
 */
interface RecoverTotpResponse {
  /** Short-lived JWT access token (30 min). Stored in memory via AuthProvider. */
  accessToken: string;
  /** Long-lived refresh token (7 days). Set as HttpOnly cookie by the API. */
  refreshToken: string;
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
 * TOTP recovery form component.
 *
 * Renders a single identifier input (no tab selector) and an 8-character
 * uppercase monospace recovery code input. The identifier is validated against
 * both regexes — the form works for students and staff alike without revealing
 * the distinction to students. On successful recovery the access token is
 * stored via `AuthProvider.login` and the user is redirected to `/dashboard`.
 *
 * @returns The rendered TOTP recovery form element.
 */
export function RecoverTotp(): ReactElement {
  const router = useRouter();
  const { login } = useAuth();

  // ── Field state ───────────────────────────────────────────────────────────
  const [identifier, setIdentifier] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');

  // ── Error state ───────────────────────────────────────────────────────────
  const [identifierError, setIdentifierError] = useState('');
  const [recoveryCodeError, setRecoveryCodeError] = useState('');
  const [formError, setFormError] = useState('');

  // ── Submission state ──────────────────────────────────────────────────────
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── Validation ────────────────────────────────────────────────────────────

  /**
   * Validates the identifier field against both matric number and staff ID
   * regexes. The error message is intentionally neutral so students cannot
   * infer that a staff format exists.
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
   * Validates the recovery code field. Expects exactly 8 characters after
   * stripping whitespace.
   *
   * @returns `true` if valid, `false` if an error was set.
   */
  const validateRecoveryCode = useCallback((): boolean => {
    const trimmed = recoveryCode.trim();
    if (!trimmed) {
      setRecoveryCodeError('Recovery code is required.');
      return false;
    }
    if (trimmed.length !== 8) {
      setRecoveryCodeError('Recovery code must be exactly 8 characters.');
      return false;
    }
    setRecoveryCodeError('');
    return true;
  }, [recoveryCode]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  /**
   * Normalises recovery code input to uppercase and strips non-alphanumeric
   * characters to guide the user toward the correct format.
   *
   * @param value - The raw input string from the change event.
   */
  const handleRecoveryCodeChange = useCallback(
    (value: string): void => {
      const cleaned = value
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 8);
      setRecoveryCode(cleaned);
      if (recoveryCodeError) setRecoveryCodeError('');
    },
    [recoveryCodeError],
  );

  /**
   * Handles form submission. Validates both fields, calls
   * `POST /auth/recover-totp`, stores the access token via `AuthProvider.login`,
   * and redirects to `/dashboard`.
   *
   * @param e - The form submit event.
   */
  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>): Promise<void> => {
      e.preventDefault();
      setFormError('');

      const idOk = validateIdentifier();
      const codeOk = validateRecoveryCode();
      if (!idOk || !codeOk) return;

      setIsSubmitting(true);
      try {
        const data = await apiPost<RecoverTotpResponse>('/auth/recover-totp', {
          identifier: identifier.trim(),
          recoveryCode: recoveryCode.trim(),
        });

        await login(data.accessToken);
        router.push('/dashboard');
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
    [identifier, recoveryCode, validateIdentifier, validateRecoveryCode, login, router],
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className={styles.container}>
      <h1 className={styles.heading}>Account Recovery</h1>
      <p className={styles.subtext}>
        Enter your ID and one of your backup recovery codes to regain access.
      </p>

      <form
        onSubmit={(e) => {
          void handleSubmit(e);
        }}
        noValidate
      >
        <div className={styles.fieldStack}>
          {/* Identifier — neutral label, no tab selector */}
          <div className={styles.fieldGroup}>
            <label htmlFor="recover-identifier" className={styles.label}>
              Matric Number
            </label>
            <input
              id="recover-identifier"
              type="text"
              autoComplete="username"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="e.g. 22/47CS/00001"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              onBlur={() => {
                if (identifier.trim()) validateIdentifier();
              }}
              className={`${styles.input} ${identifierError ? styles.inputError : ''}`}
              aria-describedby={identifierError ? 'recover-id-error' : undefined}
              aria-invalid={identifierError ? true : undefined}
              disabled={isSubmitting}
            />
            {identifierError && (
              <span id="recover-id-error" className={styles.fieldError} role="alert">
                {identifierError}
              </span>
            )}
          </div>

          {/* Recovery code */}
          <div className={styles.fieldGroup}>
            <label htmlFor="recovery-code" className={styles.label}>
              Recovery Code
            </label>
            <input
              id="recovery-code"
              type="text"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="XXXXXXXX"
              maxLength={8}
              value={recoveryCode}
              onChange={(e) => handleRecoveryCodeChange(e.target.value)}
              onBlur={() => {
                if (recoveryCode.trim()) validateRecoveryCode();
              }}
              className={`${styles.input} ${styles.recoveryCodeInput} ${recoveryCodeError ? styles.inputError : ''}`}
              aria-describedby={recoveryCodeError ? 'recovery-code-error' : undefined}
              aria-invalid={recoveryCodeError ? true : undefined}
              disabled={isSubmitting}
            />
            {recoveryCodeError && (
              <span id="recovery-code-error" className={styles.fieldError} role="alert">
                {recoveryCodeError}
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
            {isSubmitting ? 'Recovering…' : 'Recover Account'}
          </button>
        </div>
      </form>

      <Link href="/login" className={styles.backLink}>
        Back to login
      </Link>
    </div>
  );
}
