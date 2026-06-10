/**
 * @file LoginCard.tsx
 * @module components/auth/LoginCard
 *
 * Login form card. A single identifier field accepts both matric numbers
 * (students) and staff IDs — the backend determines account type from the
 * identifier format, so no client-side toggle is needed.
 *
 * Handles the full `POST /auth/login` flow including the three post-login
 * redirects:
 * - `mustChangePassword: true` → `/change-password`
 * - `totpEnrolled: false`      → `/setup-totp`
 * - Normal                     → `/verify-totp`
 */

'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { ApiError, apiPost } from '../../lib/api-client';
import { useAuth } from '../../hooks/use-auth';
import styles from './LoginCard.module.css';

// ── Types ──────────────────────────────────────────────────────────────────

/**
 * Shape of the `POST /auth/login` response body.
 */
interface LoginResponse {
  /** Short-lived interim token used for TOTP / change-password steps. */
  interimToken: string;
  /** When `true`, the user must change their password before proceeding. */
  mustChangePassword: boolean;
  /** When `false`, the user must complete TOTP setup before proceeding. */
  totpEnrolled: boolean;
}

// ── Component ──────────────────────────────────────────────────────────────

/**
 * Login form card.
 *
 * Accepts any institutional identifier (matric number or staff ID) — the
 * backend resolves the account type. On success, stores the interim token
 * in `AuthContext` and navigates to the appropriate next step.
 *
 * @returns The login card JSX element.
 */
export function LoginCard(): React.JSX.Element {
  const router = useRouter();
  const { setInterimToken } = useAuth();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  /**
   * Submits the login form. Calls `POST /auth/login` and navigates based
   * on the response flags.
   *
   * @param e - The form submit event.
   */
  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
      e.preventDefault();
      setFormError(null);
      setIsLoading(true);
      try {
        const data = await apiPost<LoginResponse>('/auth/login', {
          identifier,
          password,
        });

        setInterimToken(data.interimToken);

        if (data.mustChangePassword) {
          router.push('/change-password');
          return;
        }
        if (!data.totpEnrolled) {
          router.push('/setup-totp');
          return;
        }
        router.push('/verify-totp');
      } catch (err) {
        if (err instanceof ApiError) {
          // Never reveal whether the identifier exists (auth security rule)
          setFormError('Invalid credentials. Please check your details and try again.');
        } else {
          setFormError('An unexpected error occurred. Please try again.');
        }
      } finally {
        setIsLoading(false);
      }
    },
    [identifier, password, setInterimToken, router],
  );

  return (
    <div className={styles.card}>
      {/* Heading */}
      <div className={styles.heading}>
        <h1 className={styles.title}>Welcome back</h1>
        <p className={styles.subtitle}>Enter your matric number or staff ID to sign in.</p>
      </div>

      {/* Form */}
      <form className={styles.form} onSubmit={(e) => void handleSubmit(e)} noValidate>
        <Input
          label="Matric number or Staff ID"
          type="text"
          value={identifier}
          onChange={(e) => {
            setIdentifier(e.target.value);
            setFormError(null);
          }}
          placeholder="e.g. 22D/47CS/2024 or KWASU/LEC/CSC/00134"
          autoComplete="username"
          autoCapitalize="characters"
          spellCheck={false}
          required
        />

        <Input
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />

        {formError && (
          <p className={styles.errorText} role="alert">
            {formError}
          </p>
        )}

        <Button type="submit" variant="primary" fullWidth isLoading={isLoading}>
          Sign in
        </Button>
      </form>

      {/* Forgot password */}
      <a href="/forgot-password" className={styles.forgotLink}>
        Forgot password?
      </a>
    </div>
  );
}
