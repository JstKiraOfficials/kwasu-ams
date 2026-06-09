/**
 * @file page.tsx
 * @module app/(auth)/change-password
 *
 * Forced password change page. Shown on first login when
 * `mustChangePassword: true` is returned from `POST /auth/login`.
 *
 * After a successful password change the API indicates whether TOTP is
 * enrolled — the user is then redirected to `/setup-totp` or `/verify-totp`
 * accordingly.
 */

'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ChangePasswordForm } from '../../../components/auth/ChangePasswordForm';
import { ApiError, apiPost } from '../../../lib/api-client';
import { useAuth } from '../../../hooks/use-auth';
import styles from './page.module.css';

/**
 * Shape of the `POST /auth/change-password` response.
 */
interface ChangePasswordResponse {
  /** When `false`, the user must complete TOTP setup next. */
  totpEnrolled: boolean;
  /** Updated interim token for the next auth step. */
  interimToken?: string;
}

/**
 * Change password page component.
 *
 * Uses `ChangePasswordForm` with `showCurrentPassword={false}`. On success,
 * calls `POST /auth/change-password` and navigates to `/setup-totp` or
 * `/verify-totp` depending on the TOTP enrolment status.
 *
 * @returns The change password page JSX element.
 */
export default function ChangePasswordPage(): React.JSX.Element {
  const router = useRouter();
  const { interimToken, setInterimToken } = useAuth();

  /**
   * Handles the successful password change by calling the API and redirecting.
   */
  const handleSuccess = useCallback(async (): Promise<void> => {
    try {
      const data = await apiPost<ChangePasswordResponse>('/auth/change-password/status', {});
      if (data.interimToken) setInterimToken(data.interimToken);
      router.push(data.totpEnrolled ? '/verify-totp' : '/setup-totp');
    } catch (err) {
      if (err instanceof ApiError && !err) {
        // Swallow — ChangePasswordForm handles the error display
      }
      router.push('/setup-totp');
    }
  }, [router, setInterimToken]);

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
        <h1 className={styles.title}>Set a new password</h1>
        <p className={styles.subtitle}>
          Your account requires a password change before you can continue.
        </p>
      </div>

      <ChangePasswordForm interimToken={interimToken} onSuccess={() => void handleSuccess()} />
    </div>
  );
}
