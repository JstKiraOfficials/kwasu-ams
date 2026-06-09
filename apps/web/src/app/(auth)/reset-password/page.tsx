/**
 * @file page.tsx
 * @module app/(auth)/reset-password
 *
 * Reset password page — reached when a user clicks the password-reset link
 * from their email. The link contains a `token` query parameter:
 * `/reset-password?token=xxx`.
 *
 * Without this page, all password-reset emails lead to a 404.
 *
 * Behaviour:
 * - On mount: reads `?token` from `useSearchParams()`. Missing token →
 *   redirects to `/forgot-password`.
 * - On submit: calls `POST /auth/reset-password { token, newPassword }`.
 * - On success: shows an inline confirmation and navigates to `/login`.
 * - On `410 Gone` (expired token): shows an inline expiry error with a link
 *   back to `/forgot-password` — never a generic message.
 *
 * `useSearchParams()` requires this component to be wrapped in `<Suspense>`
 * per Next.js App Router requirements.
 */

'use client';

import { useState, useCallback, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle } from 'lucide-react';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { ApiError, apiPost } from '../../../lib/api-client';
import styles from './page.module.css';

// ── Complexity helpers (mirrors ChangePasswordForm) ────────────────────────

/**
 * Password complexity criteria evaluated in order.
 * Each criterion corresponds to one segment of the 4-segment complexity bar.
 */
const COMPLEXITY_CRITERIA: Array<{ label: string; test: (p: string) => boolean }> = [
  { label: '8+ characters', test: (p) => p.length >= 8 },
  { label: 'Uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { label: 'Number', test: (p) => /\d/.test(p) },
  { label: 'Special character', test: (p) => /[^A-Za-z0-9]/.test(p) },
];

// ── Inner component (needs useSearchParams inside Suspense) ────────────────

/**
 * Inner reset-password form that reads the `?token` query param via
 * `useSearchParams()`. Rendered inside `<Suspense>` by `ResetPasswordPage`.
 *
 * Manages three display states: main form, expired-token error, and success.
 *
 * @returns The reset password card JSX element.
 */
function ResetPasswordInner(): React.JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [token, setToken] = useState<string | null>(null);
  const [tokenExpired, setTokenExpired] = useState(false);
  const [success, setSuccess] = useState(false);

  // Form state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Complexity evaluation
  const metCriteria = COMPLEXITY_CRITERIA.map((c) => c.test(newPassword));
  const allMet = metCriteria.every(Boolean);

  // ── Read token from URL on mount ───────────────────────────────────
  useEffect(() => {
    const t = searchParams.get('token');
    if (!t) {
      router.replace('/forgot-password');
      return;
    }
    setToken(t);
  }, [searchParams, router]);

  /**
   * Validates that the confirm-password field matches on blur.
   */
  const handleConfirmBlur = useCallback((): void => {
    if (confirmPassword && confirmPassword !== newPassword) {
      setConfirmError('Passwords do not match.');
    } else {
      setConfirmError(null);
    }
  }, [confirmPassword, newPassword]);

  /**
   * Submits the reset-password request to `POST /auth/reset-password`.
   * Handles the `410 Gone` response specially to show the expiry message.
   *
   * @param e - The form submit event.
   */
  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
      e.preventDefault();
      setFormError(null);
      setConfirmError(null);

      if (newPassword !== confirmPassword) {
        setConfirmError('Passwords do not match.');
        return;
      }
      if (!allMet) {
        setFormError('Password does not meet all complexity requirements.');
        return;
      }

      setIsLoading(true);
      try {
        await apiPost('/auth/reset-password', { token, newPassword });
        setSuccess(true);
        setTimeout(() => router.push('/login'), 3000);
      } catch (err) {
        if (err instanceof ApiError && err.status === 410) {
          setTokenExpired(true);
        } else if (err instanceof ApiError) {
          setFormError(err.message);
        } else {
          setFormError('An unexpected error occurred. Please try again.');
        }
      } finally {
        setIsLoading(false);
      }
    },
    [token, newPassword, confirmPassword, allMet, router],
  );

  // ── Expired token state ──────────────────────────────────────────
  if (tokenExpired) {
    return (
      <div className={styles.card}>
        <div className={styles.logoWrap}>
          <div className={styles.logoMark} aria-label="KWASU AMS">
            KA
          </div>
        </div>
        <div className={styles.heading}>
          <h1 className={styles.title}>Link expired</h1>
        </div>
        <div className={styles.errorBox} role="alert">
          This reset link has expired. Please request a new one.{' '}
          <a href="/forgot-password" className={styles.expiredLink}>
            Request new link
          </a>
        </div>
      </div>
    );
  }

  // ── Success state ─────────────────────────────────────────────────
  if (success) {
    return (
      <div className={styles.card}>
        <div className={styles.logoWrap}>
          <div className={styles.logoMark} aria-label="KWASU AMS">
            KA
          </div>
        </div>
        <div className={styles.heading}>
          <h1 className={styles.title}>Password reset</h1>
          <p className={styles.subtitle}>
            Password reset successfully. Redirecting you to sign in…
          </p>
        </div>
      </div>
    );
  }

  // ── Main form ─────────────────────────────────────────────────────
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
        <h1 className={styles.title}>Choose a new password</h1>
        <p className={styles.subtitle}>
          Your new password must meet the complexity requirements below.
        </p>
      </div>

      <form className={styles.form} onSubmit={(e) => void handleSubmit(e)} noValidate>
        {/* New password + complexity bar */}
        <div>
          <Input
            label="New password"
            type="password"
            value={newPassword}
            onChange={(e) => {
              setNewPassword(e.target.value);
            }}
            autoComplete="new-password"
            required
          />

          {/* 4-segment complexity bar */}
          <div className={styles.complexityBar} aria-label="Password strength">
            {COMPLEXITY_CRITERIA.map((_, idx) => (
              <div
                key={idx}
                className={`${styles.segment} ${metCriteria[idx] ? styles.segmentMet : ''}`}
              />
            ))}
          </div>

          {/* Complexity hints */}
          <div className={styles.complexityHints}>
            {COMPLEXITY_CRITERIA.map((criterion, idx) => (
              <span
                key={idx}
                className={`${styles.hint} ${metCriteria[idx] ? styles.hintMet : ''}`}
              >
                {metCriteria[idx] && <CheckCircle size={11} strokeWidth={2.5} aria-hidden="true" />}
                {criterion.label}
              </span>
            ))}
          </div>
        </div>

        <Input
          label="Confirm new password"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          onBlur={handleConfirmBlur}
          {...(confirmError ? { error: confirmError } : {})}
          autoComplete="new-password"
          required
        />

        {formError && (
          <p className={styles.errorText} role="alert">
            {formError}
          </p>
        )}

        <Button
          type="submit"
          variant="primary"
          fullWidth
          isLoading={isLoading}
          disabled={!allMet || newPassword !== confirmPassword || isLoading}
        >
          Reset password
        </Button>
      </form>

      <a href="/login" className={styles.backLink}>
        Back to sign in
      </a>
    </div>
  );
}

// ── Page default export ────────────────────────────────────────────────────

/**
 * Reset password page.
 *
 * Wraps `ResetPasswordInner` in `<Suspense>` as required by Next.js App
 * Router when a Client Component calls `useSearchParams()`.
 *
 * @returns The Suspense-wrapped reset password page JSX element.
 */
export default function ResetPasswordPage(): React.JSX.Element {
  return (
    <Suspense fallback={null}>
      <ResetPasswordInner />
    </Suspense>
  );
}
