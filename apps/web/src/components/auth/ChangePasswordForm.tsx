/**
 * @file ChangePasswordForm.tsx
 * @module components/auth/ChangePasswordForm
 *
 * Reusable password change form with a 4-segment complexity bar.
 *
 * Used in two contexts:
 * 1. Auth flow (`change-password` page): calls `POST /auth/change-password`
 *    with the interim token. `showCurrentPassword` is `false`.
 * 2. Profile security settings (Phase 15): calls `PATCH /users/me/password`
 *    with the current access token. `showCurrentPassword` is `true`.
 *
 * Complexity criteria (each lights one segment):
 * 1. Length ≥ 8 characters.
 * 2. At least one uppercase letter.
 * 3. At least one digit.
 * 4. At least one special character.
 */

'use client';

import { useState, useCallback } from 'react';
import { CheckCircle } from 'lucide-react';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { apiPost, apiPatch, ApiError } from '../../lib/api-client';
import { useAuth } from '../../hooks/use-auth';
import styles from './ChangePasswordForm.module.css';

// ── Complexity helpers ─────────────────────────────────────────────────────

/**
 * A single password complexity criterion.
 */
interface ComplexityCriterion {
  /** Human-readable label shown below the bar. */
  label: string;
  /**
   * Returns `true` when the criterion is satisfied for the given password.
   *
   * @param password - The current password string to evaluate.
   * @returns `true` if the criterion is met.
   */
  test: (password: string) => boolean;
}

/**
 * Ordered list of password complexity criteria.
 * Each criterion corresponds to one segment of the complexity bar.
 */
const CRITERIA: ComplexityCriterion[] = [
  { label: '8+ characters', test: (p) => p.length >= 8 },
  { label: 'Uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { label: 'Number', test: (p) => /\d/.test(p) },
  { label: 'Special character', test: (p) => /[^A-Za-z0-9]/.test(p) },
];

// ── Props ──────────────────────────────────────────────────────────────────

/**
 * Props accepted by `ChangePasswordForm`.
 */
export interface ChangePasswordFormProps {
  /**
   * Called after a successful password change.
   * The parent component is responsible for navigation or state updates.
   */
  onSuccess?: () => void;
  /**
   * When `true`, renders a "Current password" field above the new-password
   * inputs. Used in the profile security-settings context where the user
   * must prove knowledge of their current password.
   * @defaultValue `false`
   */
  showCurrentPassword?: boolean;
  /**
   * The interim token from `POST /auth/login` used in the auth-flow context.
   * When provided, the form calls `POST /auth/change-password` with this token
   * in the `Authorization` header instead of relying on the stored access token.
   */
  interimToken?: string | null;
}

// ── Component ──────────────────────────────────────────────────────────────

/**
 * Password change form with 4-segment complexity bar and confirm-password validation.
 *
 * Calls `POST /auth/change-password` (auth flow) or `PATCH /users/me/password`
 * (profile) depending on `showCurrentPassword`. Inline errors from the API
 * are displayed below the relevant field — no `alert()` calls.
 *
 * @param props - `ChangePasswordFormProps`.
 * @returns The password change form JSX element.
 */
export function ChangePasswordForm({
  onSuccess,
  showCurrentPassword = false,
  interimToken,
}: ChangePasswordFormProps): React.JSX.Element {
  const { interimToken: ctxInterimToken } = useAuth();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  // Resolve which interim token to use
  const resolvedToken = interimToken ?? ctxInterimToken;

  // Complexity evaluation
  const metCriteria = CRITERIA.map((c) => c.test(newPassword));
  const metCount = metCriteria.filter(Boolean).length;

  /**
   * Validates that confirm matches new password on blur.
   */
  const handleConfirmBlur = useCallback((): void => {
    if (confirmPassword && confirmPassword !== newPassword) {
      setConfirmError('Passwords do not match.');
    } else {
      setConfirmError(null);
    }
  }, [confirmPassword, newPassword]);

  /**
   * Submits the password change request to the appropriate endpoint.
   *
   * @param e - The form submit event.
   */
  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
      e.preventDefault();
      setError(null);
      setConfirmError(null);

      if (newPassword !== confirmPassword) {
        setConfirmError('Passwords do not match.');
        return;
      }

      if (metCount < 4) {
        setError('Password does not meet all complexity requirements.');
        return;
      }

      setIsLoading(true);
      try {
        if (showCurrentPassword) {
          // Profile context — PATCH with current access token
          await apiPatch('/users/me/password', { currentPassword, newPassword });
        } else {
          // Auth-flow context — POST with interim token in header
          const headers: Record<string, string> = {};
          if (resolvedToken) headers['Authorization'] = `Bearer ${resolvedToken}`;
          await apiPost('/auth/change-password', { newPassword });
        }
        onSuccess?.();
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err.message);
        } else {
          setError('An unexpected error occurred. Please try again.');
        }
      } finally {
        setIsLoading(false);
      }
    },
    [
      newPassword,
      confirmPassword,
      currentPassword,
      showCurrentPassword,
      resolvedToken,
      metCount,
      onSuccess,
    ],
  );

  return (
    <form className={styles.form} onSubmit={(e) => void handleSubmit(e)} noValidate>
      {showCurrentPassword && (
        <Input
          label="Current password"
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
      )}

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
          {CRITERIA.map((_, idx) => (
            <div
              key={idx}
              className={`${styles.segment} ${metCriteria[idx] ? styles.segmentMet : ''}`}
            />
          ))}
        </div>

        {/* Complexity hints */}
        <div className={styles.complexityHints}>
          {CRITERIA.map((criterion, idx) => (
            <span key={idx} className={`${styles.hint} ${metCriteria[idx] ? styles.hintMet : ''}`}>
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

      {error && (
        <p role="alert" className={styles.errorText}>
          {error}
        </p>
      )}

      <Button
        type="submit"
        variant="primary"
        fullWidth
        isLoading={isLoading}
        disabled={metCount < 4 || newPassword !== confirmPassword || isLoading}
      >
        {showCurrentPassword ? 'Update password' : 'Set password'}
      </Button>
    </form>
  );
}
