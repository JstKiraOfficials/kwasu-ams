/**
 * @file page.tsx
 * @module app/(auth)/forgot-password
 *
 * Forgot password page. Accepts an email address and calls
 * `POST /auth/forgot-password`. Always shows the same confirmation message
 * regardless of whether the email exists in the system — this prevents
 * email enumeration attacks. The page does NOT navigate away on success.
 */

'use client';

import { useState, useCallback } from 'react';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { ApiError, apiPost } from '../../../lib/api-client';
import styles from './page.module.css';

/**
 * Forgot password page component.
 *
 * On successful submission, renders an inline confirmation message.
 * The same message is shown regardless of whether the email is registered
 * — this mirrors the backend's email enumeration prevention.
 *
 * @returns The forgot password page JSX element.
 */
export default function ForgotPasswordPage(): React.JSX.Element {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Submits the forgot-password request to `POST /auth/forgot-password`.
   * Always shows the same confirmation message on completion.
   *
   * @param e - The form submit event.
   */
  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
      e.preventDefault();
      setError(null);
      setIsLoading(true);
      try {
        await apiPost('/auth/forgot-password', { email });
      } catch (err) {
        // Only surface unexpected non-API errors — 4xx responses are swallowed
        // to prevent email enumeration (the UI always shows the same message).
        if (err instanceof ApiError && err.status >= 500) {
          setError('Something went wrong. Please try again.');
          setIsLoading(false);
          return;
        }
      } finally {
        setIsLoading(false);
      }
      // Always show confirmation — never reveal whether the email exists
      setSubmitted(true);
    },
    [email],
  );

  return (
    <div className={styles.card}>
      {/* Logo */}
      <div className={styles.logoWrap}>
        <div className={styles.logoMark} aria-label="KWASU AMS">
          KA
        </div>
      </div>

      {/* Heading */}
      <div className={styles.heading}>
        <h1 className={styles.title}>Reset your password</h1>
        <p className={styles.subtitle}>
          Enter your registered email address and we&apos;ll send a reset link.
        </p>
      </div>

      {submitted ? (
        <p className={styles.successBox} role="status">
          If an account exists for this email, a reset link has been sent. Please check your inbox
          (and spam folder).
        </p>
      ) : (
        <form className={styles.form} onSubmit={(e) => void handleSubmit(e)} noValidate>
          <Input
            label="Email address"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
          />

          {error && (
            <p className={styles.errorText} role="alert">
              {error}
            </p>
          )}

          <Button
            type="submit"
            variant="primary"
            fullWidth
            isLoading={isLoading}
            disabled={!email || isLoading}
          >
            Send reset link
          </Button>
        </form>
      )}

      <a href="/login" className={styles.backLink}>
        Back to sign in
      </a>
    </div>
  );
}
