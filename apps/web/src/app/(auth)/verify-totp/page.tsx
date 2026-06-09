/**
 * @file page.tsx
 * @module app/(auth)/verify-totp
 *
 * TOTP verification page. Shown after a successful `POST /auth/login` when
 * the user already has TOTP enrolled. Accepts a 6-digit code, auto-submits
 * on the 6th character, shows a 30-second countdown, and navigates to
 * `/dashboard` on success.
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '../../../components/ui/Button';
import { ApiError, apiPost } from '../../../lib/api-client';
import { useAuth } from '../../../hooks/use-auth';
import styles from './page.module.css';

/** Total seconds per TOTP window. */
const TOTP_WINDOW_SECONDS = 30;

/**
 * Shape of the `POST /auth/verify-totp` response.
 */
interface VerifyTotpResponse {
  /** Full JWT access token. Stored in memory after successful verification. */
  accessToken: string;
  /** Refresh token — set as HttpOnly cookie by the API. */
  refreshToken?: string;
}

/**
 * TOTP verification page component.
 *
 * Starts a 30-second countdown on mount. Resets to 30 when the user clears
 * the input. Auto-submits when 6 digits are entered. On success, stores the
 * access token via `AuthContext.login()` and navigates to `/dashboard`.
 *
 * @returns The TOTP verify page JSX element.
 */
export default function VerifyTotpPage(): React.JSX.Element {
  const router = useRouter();
  const { interimToken, login } = useAuth();

  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(TOTP_WINDOW_SECONDS);
  const submitCalledRef = useRef(false);

  // ── 30-second countdown ────────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsLeft((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  /**
   * Submits the 6-digit TOTP code to `POST /auth/verify-totp`.
   * Uses the interim token from `AuthContext` in the Authorization header.
   *
   * @param currentCode - The 6-digit code to verify.
   */
  const handleSubmit = useCallback(
    async (currentCode: string): Promise<void> => {
      if (currentCode.length !== 6 || isLoading) return;
      setError(null);
      setIsLoading(true);
      try {
        const data = await apiPost<VerifyTotpResponse>('/auth/verify-totp', {
          code: currentCode,
          interimToken,
        });
        await login(data.accessToken, data.refreshToken ?? '');
        router.push('/dashboard');
      } catch (err) {
        if (err instanceof ApiError) {
          setError('Invalid or expired code. Please try again.');
        } else {
          setError('An unexpected error occurred. Please try again.');
        }
        setCode('');
        submitCalledRef.current = false;
      } finally {
        setIsLoading(false);
      }
    },
    [interimToken, isLoading, login, router],
  );

  // ── Auto-submit on 6 digits ────────────────────────────────────────
  useEffect(() => {
    if (code.length === 6 && !submitCalledRef.current) {
      submitCalledRef.current = true;
      void handleSubmit(code);
    }
  }, [code, handleSubmit]);

  /**
   * Handles digit-only input for the code field.
   *
   * @param e - The change event from the code input.
   */
  const handleCodeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>): void => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 6);
    setCode(val);
    if (val.length < 6) submitCalledRef.current = false;
    setError(null);
  }, []);

  const isExpired = secondsLeft === 0;

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
        <h1 className={styles.title}>Enter your 6-digit code</h1>
        <p className={styles.subtitle}>Open your authenticator app and enter the current code.</p>
      </div>

      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          void handleSubmit(code);
        }}
        noValidate
      >
        {/* Large centred digit input */}
        <div className={styles.codeInputWrap}>
          <input
            className={styles.codeInput}
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={handleCodeChange}
            autoComplete="one-time-code"
            aria-label="6-digit authenticator code"
            aria-describedby="totp-countdown"
            disabled={isLoading}
            autoFocus
          />
        </div>

        {/* Countdown */}
        <p
          id="totp-countdown"
          className={`${styles.countdown} ${isExpired ? styles.countdownExpired : ''}`}
        >
          {isExpired
            ? 'Code expired. Open your authenticator app for a new code.'
            : `Code refreshes in ${secondsLeft}s`}
        </p>

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
          disabled={code.length !== 6 || isLoading}
        >
          Verify
        </Button>
      </form>

      <a href="/recover-totp" className={styles.backupLink}>
        Use a backup code instead
      </a>
    </div>
  );
}
