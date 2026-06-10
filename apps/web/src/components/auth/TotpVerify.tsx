'use client';

/**
 * @file TotpVerify.tsx
 * @module components/auth
 *
 * TOTP verification component for the KWASU AMS web application.
 *
 * Renders a 6-digit code input, a 30-second countdown timer showing the
 * remaining seconds in the current TOTP window, a submit button, and a
 * link to the recovery code flow. On success, calls `AuthProvider.login`
 * with the returned access token and redirects to `/dashboard`.
 *
 * The countdown timer updates every second via `setInterval` and is
 * computed as: `30 - (Math.floor(Date.now() / 1000) % 30)`.
 */

import { useState, useEffect, useCallback, useRef, type FormEvent, type ReactElement } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiPost, ApiError } from '@/lib/api-client';
import { useAuth } from '@/providers/auth-provider';
import { useAuthFlow } from '@/providers/auth-flow-provider';
import styles from './TotpVerify.module.css';

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Shape of the response returned by `POST /auth/verify-totp`.
 */
interface VerifyTotpResponse {
  /** Short-lived JWT access token (30 min). Stored in memory via AuthProvider. */
  accessToken: string;
  /** Long-lived refresh token (7 days). Set as HttpOnly cookie by the API. */
  refreshToken: string;
}

/**
 * Props for the {@link TotpVerify} component.
 *
 * @property interimToken - The interim token received after a successful
 *   `POST /auth/login`. Must be passed from the auth flow state. If not
 *   provided the component redirects back to `/login`.
 */
export interface TotpVerifyProps {
  /** Interim token from the preceding login step, held in memory. */
  interimToken?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Computes the number of seconds remaining in the current 30-second TOTP window.
 *
 * @returns A number in the range [1, 30].
 */
function getSecondsRemaining(): number {
  return 30 - (Math.floor(Date.now() / 1000) % 30);
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * TOTP verification form component.
 *
 * Displays a centred 6-digit code input with a live countdown timer
 * reflecting the remaining seconds in the current TOTP window. On successful
 * verification the access token is stored via `AuthProvider.login` and the
 * user is redirected to `/dashboard`.
 *
 * @param props - {@link TotpVerifyProps}
 * @returns The rendered TOTP verification form element.
 */
export function TotpVerify({ interimToken }: TotpVerifyProps): ReactElement {
  const router = useRouter();
  const { login } = useAuth();
  const { interimToken: contextToken } = useAuthFlow();
  const token = interimToken ?? contextToken ?? undefined;

  // ── Field state ───────────────────────────────────────────────────────────
  const [code, setCode] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── Countdown timer ───────────────────────────────────────────────────────
  const [secondsLeft, setSecondsLeft] = useState<number>(getSecondsRemaining);

  useEffect(() => {
    const id = setInterval(() => {
      setSecondsLeft(getSecondsRemaining());
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // ── Auto-focus the input on mount ─────────────────────────────────────────
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // ── Redirect to login if no interim token ─────────────────────────────────
  useEffect(() => {
    if (!token) {
      router.replace('/login');
    }
  }, [token, router]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  /**
   * Restricts code input to digits only and caps it at 6 characters.
   *
   * @param value - The raw input value from the change event.
   */
  const handleCodeChange = useCallback(
    (value: string): void => {
      const digits = value.replace(/\D/g, '').slice(0, 6);
      setCode(digits);
      if (fieldError) setFieldError('');
    },
    [fieldError],
  );

  /**
   * Validates and submits the 6-digit TOTP code to `POST /auth/verify-totp`.
   * On success, stores the access token and redirects to `/dashboard`.
   *
   * @param e - The form submit event.
   */
  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>): Promise<void> => {
      e.preventDefault();
      setFormError('');

      if (code.length !== 6) {
        setFieldError('Please enter all 6 digits.');
        return;
      }

      setIsSubmitting(true);
      try {
        const data = await apiPost<VerifyTotpResponse>('/auth/verify-totp', {
          code,
          interimToken: token,
        });

        await login(data.accessToken);
        router.push('/dashboard');
      } catch (err) {
        if (err instanceof ApiError) {
          setFormError(err.message);
        } else {
          setFormError('An unexpected error occurred. Please try again.');
        }
        setCode('');
        inputRef.current?.focus();
      } finally {
        setIsSubmitting(false);
      }
    },
    [code, interimToken, login, router],
  );

  // ── Render ────────────────────────────────────────────────────────────────
  const isExpiring = secondsLeft <= 5;

  return (
    <div className={styles.container}>
      <h1 className={styles.heading}>Two-Factor Authentication</h1>
      <p className={styles.subtext}>Enter the 6-digit code from your authenticator app.</p>

      <form
        onSubmit={(e) => {
          void handleSubmit(e);
        }}
        noValidate
      >
        <div className={styles.fieldGroup}>
          <input
            ref={inputRef}
            id="totp-code"
            type="text"
            inputMode="numeric"
            maxLength={6}
            autoComplete="one-time-code"
            placeholder="000000"
            value={code}
            onChange={(e) => handleCodeChange(e.target.value)}
            className={`${styles.codeInput} ${fieldError ? styles.codeInputError : ''}`}
            aria-label="6-digit TOTP code"
            aria-describedby={fieldError ? 'totp-field-error' : 'totp-timer'}
            aria-invalid={fieldError ? true : undefined}
            disabled={isSubmitting}
          />

          <p
            id="totp-timer"
            className={`${styles.timer} ${isExpiring ? styles.timerExpiring : ''}`}
            aria-live="polite"
            aria-atomic="true"
          >
            Code refreshes in {secondsLeft}s
          </p>

          {fieldError && (
            <span id="totp-field-error" className={styles.fieldError} role="alert">
              {fieldError}
            </span>
          )}
        </div>

        {formError && (
          <div className={styles.formError} role="alert">
            {formError}
          </div>
        )}

        <button
          type="submit"
          className={styles.submitButton}
          disabled={isSubmitting || code.length !== 6}
          aria-busy={isSubmitting}
        >
          {isSubmitting && <span className={styles.spinner} aria-hidden="true" />}
          {isSubmitting ? 'Verifying…' : 'Verify Code'}
        </button>
      </form>

      <Link href="/recover-totp" className={styles.recoveryLink}>
        Use a recovery code instead
      </Link>
    </div>
  );
}
