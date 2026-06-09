/**
 * @file page.tsx
 * @module app/(auth)/recover-totp
 *
 * TOTP recovery page. Allows a user to authenticate using a single-use
 * backup code instead of their authenticator app. Includes the same
 * Student/Staff identifier toggle as the login page.
 *
 * On success, the user is fully authenticated and navigated to `/dashboard`.
 */

'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { ApiError, apiPost } from '../../../lib/api-client';
import { useAuth } from '../../../hooks/use-auth';
import styles from './page.module.css';

/** Whether the recovering user is a student or staff member. */
type UserType = 'STUDENT' | 'STAFF';

/**
 * Response from `POST /auth/recover-totp`.
 */
interface RecoverTotpResponse {
  /** Full JWT access token issued after successful recovery. */
  accessToken: string;
  /** Refresh token — set as HttpOnly cookie by the API. */
  refreshToken?: string;
}

/**
 * TOTP recovery page component.
 *
 * Renders identifier and backup-code fields. The backup code input
 * auto-uppercases input since codes are uppercase alphanumeric.
 * On success calls `AuthContext.login()` and navigates to `/dashboard`.
 *
 * @returns The TOTP recovery page JSX element.
 */
export default function RecoverTotpPage(): React.JSX.Element {
  const router = useRouter();
  const { login } = useAuth();

  const [userType, setUserType] = useState<UserType>('STUDENT');
  const [identifier, setIdentifier] = useState('');
  const [backupCode, setBackupCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isStudent = userType === 'STUDENT';

  /**
   * Switches between Student and Staff identifier modes.
   * Clears the identifier on switch.
   *
   * @param type - The user type to switch to.
   */
  const handleTypeSwitch = useCallback((type: UserType): void => {
    setUserType(type);
    setIdentifier('');
    setError(null);
  }, []);

  /**
   * Submits the recovery request to `POST /auth/recover-totp`.
   * On success, logs in and navigates to `/dashboard`.
   *
   * @param e - The form submit event.
   */
  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
      e.preventDefault();
      setError(null);
      setIsLoading(true);
      try {
        const data = await apiPost<RecoverTotpResponse>('/auth/recover-totp', {
          identifier,
          backupCode,
          identifierType: isStudent ? 'MATRIC' : 'STAFF_ID',
        });
        await login(data.accessToken, data.refreshToken ?? '');
        router.push('/dashboard');
      } catch (err) {
        if (err instanceof ApiError) {
          setError('Invalid identifier or backup code. Please check and try again.');
        } else {
          setError('An unexpected error occurred. Please try again.');
        }
      } finally {
        setIsLoading(false);
      }
    },
    [identifier, backupCode, isStudent, login, router],
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
        <h1 className={styles.title}>Recover access</h1>
        <p className={styles.subtitle}>
          Enter your identifier and a backup code to sign in without your authenticator app.
        </p>
      </div>

      {/* Student / Staff toggle */}
      <div className={styles.toggle} role="group" aria-label="Select account type">
        <button
          type="button"
          className={`${styles.toggleBtn} ${isStudent ? styles.toggleBtnActive : ''}`}
          onClick={() => handleTypeSwitch('STUDENT')}
          aria-pressed={isStudent}
        >
          Student
        </button>
        <button
          type="button"
          className={`${styles.toggleBtn} ${!isStudent ? styles.toggleBtnActive : ''}`}
          onClick={() => handleTypeSwitch('STAFF')}
          aria-pressed={!isStudent}
        >
          Staff
        </button>
      </div>

      {/* Form */}
      <form className={styles.form} onSubmit={(e) => void handleSubmit(e)} noValidate>
        <Input
          label={isStudent ? 'Matric Number' : 'Staff ID'}
          type="text"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          placeholder={isStudent ? 'e.g. 22D/47CS/2024' : 'e.g. KWASU/LEC/CSC/00134'}
          autoComplete="username"
          autoCapitalize="characters"
          spellCheck={false}
          required
        />

        <Input
          label="Backup code"
          type="text"
          value={backupCode}
          onChange={(e) => setBackupCode(e.target.value.toUpperCase().slice(0, 8))}
          placeholder="e.g. AB12CD34"
          autoComplete="off"
          spellCheck={false}
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
          disabled={!identifier || backupCode.length < 6 || isLoading}
        >
          Recover access
        </Button>
      </form>

      <a href="/verify-totp" className={styles.backLink}>
        Back to authenticator code
      </a>
    </div>
  );
}
