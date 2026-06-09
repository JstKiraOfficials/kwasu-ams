/**
 * @file LoginCard.tsx
 * @module components/auth/LoginCard
 *
 * Login form card with a Student / Staff tab toggle, identifier input,
 * password input, and a "Forgot password?" link. Handles the full
 * `POST /auth/login` flow including the three post-login redirects:
 *
 * - `mustChangePassword: true` → `/change-password`
 * - `totpEnrolled: false`      → `/setup-totp`
 * - Normal                     → `/verify-totp`
 *
 * Client-side format validation fires on blur — no API call for format errors.
 */

'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { ApiError, apiPost } from '../../lib/api-client';
import { useAuth } from '../../hooks/use-auth';
import styles from './LoginCard.module.css';

// ── Identity regex (mirrors packages/utils/src/constants/identity.ts) ─────
// Imported from the shared package at runtime; duplicated here as a fallback
// comment only — the actual values come from the API validation anyway.

/**
 * Client-side matric number format validator.
 * Pattern: `22D/47XCS/2024` style numbers.
 */
const MATRIC_REGEX = /^\d{2}[dD]?\/\d{1,2}[A-Za-z]{1,3}\/\d{3,5}$/;

/**
 * Client-side staff ID format validator.
 * Pattern: `KWASU/LEC/CSC/00134` style identifiers.
 */
const STAFF_ID_REGEX = /^[Kk][Ww][Aa][Ss][Uu]\/[A-Za-z]{2,5}\/[A-Za-z]{2,5}\/\d{2,5}$/;

// ── Types ──────────────────────────────────────────────────────────────────

/**
 * Whether the user is logging in as a student or staff member.
 * Determines the label and validation regex for the identifier field.
 */
type UserType = 'STUDENT' | 'STAFF';

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
 * Manages the Student/Staff toggle, identifier and password fields, and
 * submission. On success it stores the interim token in `AuthContext` and
 * navigates to the appropriate next step in the auth flow.
 *
 * @returns The login card JSX element.
 */
export function LoginCard(): React.JSX.Element {
  const router = useRouter();
  const { setInterimToken } = useAuth();

  const [userType, setUserType] = useState<UserType>('STUDENT');
  const [identifier, setIdentifier] = useState('');
  const [identifierError, setIdentifierError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const isStudent = userType === 'STUDENT';
  const identifierLabel = isStudent ? 'Matric Number' : 'Staff ID';
  const identifierPlaceholder = isStudent ? 'e.g. 22D/47CS/2024' : 'e.g. KWASU/LEC/CSC/00134';

  /**
   * Validates the identifier format on blur.
   * Shows an inline error without making an API call.
   */
  const handleIdentifierBlur = useCallback((): void => {
    if (!identifier) return;
    const valid = isStudent ? MATRIC_REGEX.test(identifier) : STAFF_ID_REGEX.test(identifier);
    setIdentifierError(valid ? null : `Invalid ${identifierLabel} format.`);
  }, [identifier, isStudent, identifierLabel]);

  /**
   * Switches between Student and Staff login modes.
   * Clears identifier value and errors on switch.
   *
   * @param type - The user type to switch to.
   */
  const handleTypeSwitch = useCallback((type: UserType): void => {
    setUserType(type);
    setIdentifier('');
    setIdentifierError(null);
    setFormError(null);
  }, []);

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

      // Re-validate format before API call
      const valid = isStudent ? MATRIC_REGEX.test(identifier) : STAFF_ID_REGEX.test(identifier);
      if (!valid) {
        setIdentifierError(`Invalid ${identifierLabel} format.`);
        return;
      }

      setIsLoading(true);
      try {
        const data = await apiPost<LoginResponse>('/auth/login', {
          identifier,
          password,
          identifierType: isStudent ? 'MATRIC' : 'STAFF_ID',
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
          // Never reveal whether the identifier exists (auth rule)
          setFormError('Invalid credentials. Please check your details and try again.');
        } else {
          setFormError('An unexpected error occurred. Please try again.');
        }
      } finally {
        setIsLoading(false);
      }
    },
    [identifier, password, isStudent, identifierLabel, setInterimToken, router],
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
        <h1 className={styles.title}>Welcome back</h1>
        <p className={styles.subtitle}>Sign in to your KWASU account</p>
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
          label={identifierLabel}
          type="text"
          value={identifier}
          onChange={(e) => {
            setIdentifier(e.target.value);
            setIdentifierError(null);
          }}
          onBlur={handleIdentifierBlur}
          placeholder={identifierPlaceholder}
          {...(identifierError ? { error: identifierError } : {})}
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
