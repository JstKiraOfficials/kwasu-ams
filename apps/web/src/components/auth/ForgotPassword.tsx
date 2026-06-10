'use client';

/**
 * @file ForgotPassword.tsx
 * @module components/auth
 *
 * Forgot password component for the KWASU AMS web application.
 *
 * Renders a single identifier input that auto-detects student vs staff by
 * testing both regexes — no tab selector is shown. Students are unaware that
 * staff use the same form. Also renders an email input.
 *
 * On submit, calls `POST /auth/forgot-password`. The success message is always
 * displayed regardless of whether the identifier exists — this prevents user
 * enumeration (the API does the same).
 *
 * Validation fires on field blur and form submit — not on every keystroke.
 */

import { useState, useCallback, type FormEvent, type ReactElement } from 'react';
import Link from 'next/link';
import { MATRIC_NUMBER_REGEX, STAFF_ID_REGEX } from '@kwasu-ams/utils';
import { apiPost } from '@/lib/api-client';
import styles from './ForgotPassword.module.css';

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
 * Forgot password form component.
 *
 * Renders a single identifier input (no tab selector) and an email input.
 * The identifier is validated against both matric number and staff ID regexes
 * so the form works for all user types without revealing the distinction to
 * students. Calls `POST /auth/forgot-password` on submit. Always shows the
 * same success message after submission to prevent user enumeration attacks.
 *
 * @returns The rendered forgot-password form element.
 */
export function ForgotPassword(): ReactElement {
  // ── Field state ───────────────────────────────────────────────────────────
  const [identifier, setIdentifier] = useState('');
  const [email, setEmail] = useState('');

  // ── Error state ───────────────────────────────────────────────────────────
  const [identifierError, setIdentifierError] = useState('');
  const [emailError, setEmailError] = useState('');

  // ── Submission state ──────────────────────────────────────────────────────
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

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
   * Validates the email field using a basic format check.
   *
   * @returns `true` if valid, `false` if an error was set.
   */
  const validateEmail = useCallback((): boolean => {
    const trimmed = email.trim();
    if (!trimmed) {
      setEmailError('Email address is required.');
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailError('Please enter a valid email address.');
      return false;
    }
    setEmailError('');
    return true;
  }, [email]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  /**
   * Handles form submission. Validates both fields, then calls
   * `POST /auth/forgot-password`. Always transitions to the success state
   * regardless of the API outcome to prevent user enumeration.
   *
   * @param e - The form submit event.
   */
  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>): Promise<void> => {
      e.preventDefault();

      const idOk = validateIdentifier();
      const emailOk = validateEmail();
      if (!idOk || !emailOk) return;

      setIsSubmitting(true);
      try {
        await apiPost('/auth/forgot-password', {
          identifier: identifier.trim(),
          email: email.trim(),
        });
      } catch {
        // Intentionally swallowed — always show success to prevent enumeration.
      } finally {
        setIsSubmitting(false);
        setSubmitted(true);
      }
    },
    [identifier, email, validateIdentifier, validateEmail],
  );

  // ── Render ────────────────────────────────────────────────────────────────

  if (submitted) {
    return (
      <div className={styles.container}>
        <h1 className={styles.heading}>Check Your Email</h1>
        <div className={styles.successBanner} role="status">
          If that account exists, a password reset link has been sent to your registered email
          address. Check your inbox and follow the instructions.
        </div>
        <Link href="/login" className={styles.backLink}>
          Back to login
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <h1 className={styles.heading}>Forgot Password</h1>
      <p className={styles.subtext}>
        Enter your ID and registered email address. If the account exists, a reset link will be
        sent.
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
            <label htmlFor="forgot-identifier" className={styles.label}>
              Matric Number
            </label>
            <input
              id="forgot-identifier"
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
              aria-describedby={identifierError ? 'forgot-id-error' : undefined}
              aria-invalid={identifierError ? true : undefined}
              disabled={isSubmitting}
            />
            {identifierError && (
              <span id="forgot-id-error" className={styles.fieldError} role="alert">
                {identifierError}
              </span>
            )}
          </div>

          {/* Email */}
          <div className={styles.fieldGroup}>
            <label htmlFor="forgot-email" className={styles.label}>
              Registered Email Address
            </label>
            <input
              id="forgot-email"
              type="email"
              autoComplete="email"
              placeholder="e.g. student@kwasu.edu.ng"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => {
                if (email.trim()) validateEmail();
              }}
              className={`${styles.input} ${emailError ? styles.inputError : ''}`}
              aria-describedby={emailError ? 'forgot-email-error' : undefined}
              aria-invalid={emailError ? true : undefined}
              disabled={isSubmitting}
            />
            {emailError && (
              <span id="forgot-email-error" className={styles.fieldError} role="alert">
                {emailError}
              </span>
            )}
          </div>

          {/* Submit */}
          <button
            type="submit"
            className={styles.submitButton}
            disabled={isSubmitting}
            aria-busy={isSubmitting}
          >
            {isSubmitting && <span className={styles.spinner} aria-hidden="true" />}
            {isSubmitting ? 'Sending…' : 'Send Reset Link'}
          </button>
        </div>
      </form>

      <Link href="/login" className={styles.backLink}>
        Back to login
      </Link>
    </div>
  );
}
