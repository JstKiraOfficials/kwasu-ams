'use client';

/**
 * @file ChangePassword.tsx
 * @module components/auth
 *
 * Forced password change component for the KWASU AMS web application.
 *
 * Shown when a user logs in for the first time (`mustChangePassword: true`)
 * or when an existing user changes their password. Renders a new-password
 * input with a 4-bar complexity indicator, a confirm-password input, and
 * optionally a current-password input when the user is not on first login.
 *
 * On success, redirects to `/setup-totp` if the user is not yet TOTP-enrolled,
 * or to `/verify-totp` otherwise.
 *
 * Validation fires on field blur and form submit — not on every keystroke.
 */

import { useState, useCallback, type FormEvent, type ReactElement } from 'react';
import { useRouter } from 'next/navigation';
import { apiPost, ApiError } from '@/lib/api-client';
import { useAuthFlow } from '@/providers/auth-flow-provider';
import styles from './ChangePassword.module.css';

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Shape of the response returned by `POST /auth/change-password`.
 */
interface ChangePasswordResponse {
  /** Whether the user has completed TOTP enrollment. */
  totpEnrolled: boolean;
}

/**
 * Props for the {@link ChangePassword} component.
 *
 * @property interimToken - Interim token received after `POST /auth/login`.
 * @property mustChangePassword - When `true`, the current-password field is
 *   hidden because it is a first-login forced reset.
 */
export interface ChangePasswordProps {
  /** Interim token from the preceding login step, held in memory. */
  interimToken?: string;
  /**
   * When `true` this is a first-login forced reset and the "current password"
   * field is not shown. Defaults to `false`.
   */
  mustChangePassword?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Describes a single password complexity rule.
 *
 * @property label - Human-readable description shown in the requirements list.
 * @property test - Predicate that returns `true` when the rule is satisfied.
 */
interface ComplexityRule {
  /** Human-readable description of the rule. */
  label: string;
  /** Returns `true` when the rule is satisfied by the given password. */
  test: (pw: string) => boolean;
}

/**
 * The four password complexity rules enforced by KWASU AMS.
 * Each rule maps to one bar in the complexity indicator.
 */
const COMPLEXITY_RULES: ComplexityRule[] = [
  { label: 'At least 12 characters', test: (pw) => pw.length >= 12 },
  { label: 'At least one uppercase letter', test: (pw) => /[A-Z]/.test(pw) },
  { label: 'At least one digit (0–9)', test: (pw) => /\d/.test(pw) },
  { label: 'At least one special character', test: (pw) => /[^A-Za-z0-9]/.test(pw) },
];

// ── Sub-components ────────────────────────────────────────────────────────────

/**
 * Props for the {@link PasswordToggleIcon} inline helper.
 *
 * @property visible - When `true` renders the "eye-off" (hide) icon;
 *   when `false` renders the "eye" (show) icon.
 */
interface PasswordToggleIconProps {
  /** Whether the password is currently visible. */
  visible: boolean;
}

/**
 * Renders an eye or eye-off SVG icon for the password show/hide toggle button.
 *
 * @param props - {@link PasswordToggleIconProps}
 * @returns The SVG icon element.
 */
function PasswordToggleIcon({ visible }: PasswordToggleIconProps): ReactElement {
  return visible ? (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  ) : (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Forced / voluntary password change form.
 *
 * Features:
 * - Optional current-password field (hidden on first-login forced reset).
 * - New-password field with a 4-bar complexity indicator.
 * - Confirm-password field with match validation.
 * - Password requirements checklist with live status icons.
 * - Redirects to `/setup-totp` or `/verify-totp` on success.
 *
 * @param props - {@link ChangePasswordProps}
 * @returns The rendered password change form element.
 */
export function ChangePassword({
  interimToken,
  mustChangePassword = false,
}: ChangePasswordProps): ReactElement {
  const router = useRouter();
  const { interimToken: contextToken } = useAuthFlow();
  const token = interimToken ?? contextToken ?? undefined;

  // ── Field state ───────────────────────────────────────────────────────────
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // ── Error state ───────────────────────────────────────────────────────────
  const [currentError, setCurrentError] = useState('');
  const [newError, setNewError] = useState('');
  const [confirmError, setConfirmError] = useState('');
  const [formError, setFormError] = useState('');

  // ── Submission state ──────────────────────────────────────────────────────
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── Complexity checks ─────────────────────────────────────────────────────
  const ruleResults = COMPLEXITY_RULES.map((r) => r.test(newPassword));
  const allRulesMet = ruleResults.every(Boolean);

  // ── Validation ────────────────────────────────────────────────────────────

  /**
   * Validates the new password field against the complexity rules.
   *
   * @returns `true` if all complexity rules are met; `false` otherwise.
   */
  const validateNew = useCallback((): boolean => {
    if (!newPassword) {
      setNewError('New password is required.');
      return false;
    }
    if (!allRulesMet) {
      setNewError('Password does not meet all requirements.');
      return false;
    }
    setNewError('');
    return true;
  }, [newPassword, allRulesMet]);

  /**
   * Validates that the confirm-password field matches the new-password field.
   *
   * @returns `true` if the values match; `false` otherwise.
   */
  const validateConfirm = useCallback((): boolean => {
    if (!confirmPassword) {
      setConfirmError('Please confirm your new password.');
      return false;
    }
    if (confirmPassword !== newPassword) {
      setConfirmError('Passwords do not match.');
      return false;
    }
    setConfirmError('');
    return true;
  }, [confirmPassword, newPassword]);

  /**
   * Validates the current-password field (only when not a first-login reset).
   *
   * @returns `true` if the field is populated or not required; `false` otherwise.
   */
  const validateCurrent = useCallback((): boolean => {
    if (mustChangePassword) return true; // field is hidden
    if (!currentPassword) {
      setCurrentError('Current password is required.');
      return false;
    }
    setCurrentError('');
    return true;
  }, [mustChangePassword, currentPassword]);

  // ── Submit ────────────────────────────────────────────────────────────────

  /**
   * Handles form submission. Validates all fields, calls
   * `POST /auth/change-password`, then redirects based on `totpEnrolled`.
   *
   * @param e - The form submit event.
   */
  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>): Promise<void> => {
      e.preventDefault();
      setFormError('');

      const curOk = validateCurrent();
      const newOk = validateNew();
      const conOk = validateConfirm();
      if (!curOk || !newOk || !conOk) return;

      setIsSubmitting(true);
      try {
        const data = await apiPost<ChangePasswordResponse>('/auth/change-password', {
          ...(mustChangePassword ? {} : { currentPassword }),
          newPassword,
          interimToken: token,
        });

        router.push(data.totpEnrolled ? '/verify-totp' : '/setup-totp');
      } catch (err) {
        if (err instanceof ApiError) {
          setFormError(err.message);
        } else {
          setFormError('An unexpected error occurred. Please try again.');
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      mustChangePassword,
      currentPassword,
      newPassword,
      interimToken,
      validateCurrent,
      validateNew,
      validateConfirm,
      router,
    ],
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className={styles.container}>
      <h1 className={styles.heading}>Set Your Password</h1>
      <p className={styles.subtext}>You must set a new password before continuing.</p>

      <form
        onSubmit={(e) => {
          void handleSubmit(e);
        }}
        noValidate
      >
        <div className={styles.fieldStack}>
          {/* Current password — hidden on first login */}
          {!mustChangePassword && (
            <div className={styles.fieldGroup}>
              <label htmlFor="current-password" className={styles.label}>
                Current Password
              </label>
              <div className={styles.inputWrapper}>
                <input
                  id="current-password"
                  type={showCurrent ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  onBlur={() => {
                    if (currentPassword) validateCurrent();
                  }}
                  className={`${styles.input} ${styles.inputWithToggle} ${currentError ? styles.inputError : ''}`}
                  aria-describedby={currentError ? 'current-pw-error' : undefined}
                  aria-invalid={currentError ? true : undefined}
                  disabled={isSubmitting}
                />
                <button
                  type="button"
                  className={styles.toggleButton}
                  onClick={() => setShowCurrent((v) => !v)}
                  aria-label={showCurrent ? 'Hide current password' : 'Show current password'}
                  tabIndex={-1}
                >
                  <PasswordToggleIcon visible={showCurrent} />
                </button>
              </div>
              {currentError && (
                <span id="current-pw-error" className={styles.fieldError} role="alert">
                  {currentError}
                </span>
              )}
            </div>
          )}

          {/* New password */}
          <div className={styles.fieldGroup}>
            <label htmlFor="new-password" className={styles.label}>
              New Password
            </label>
            <div className={styles.inputWrapper}>
              <input
                id="new-password"
                type={showNew ? 'text' : 'password'}
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                onBlur={() => {
                  if (newPassword) validateNew();
                }}
                className={`${styles.input} ${styles.inputWithToggle} ${newError ? styles.inputError : ''}`}
                aria-describedby={
                  [newError ? 'new-pw-error' : '', 'pw-requirements'].filter(Boolean).join(' ') ||
                  undefined
                }
                aria-invalid={newError ? true : undefined}
                disabled={isSubmitting}
              />
              <button
                type="button"
                className={styles.toggleButton}
                onClick={() => setShowNew((v) => !v)}
                aria-label={showNew ? 'Hide new password' : 'Show new password'}
                tabIndex={-1}
              >
                <PasswordToggleIcon visible={showNew} />
              </button>
            </div>

            {/* Complexity bars */}
            <div className={styles.complexityBars} aria-hidden="true">
              {ruleResults.map((met, i) => (
                <div key={i} className={`${styles.bar} ${met ? styles.barMet : ''}`} />
              ))}
            </div>

            {newError && (
              <span id="new-pw-error" className={styles.fieldError} role="alert">
                {newError}
              </span>
            )}
          </div>

          {/* Confirm password */}
          <div className={styles.fieldGroup}>
            <label htmlFor="confirm-password" className={styles.label}>
              Confirm New Password
            </label>
            <div className={styles.inputWrapper}>
              <input
                id="confirm-password"
                type={showConfirm ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onBlur={() => {
                  if (confirmPassword) validateConfirm();
                }}
                className={`${styles.input} ${styles.inputWithToggle} ${confirmError ? styles.inputError : ''}`}
                aria-describedby={confirmError ? 'confirm-pw-error' : undefined}
                aria-invalid={confirmError ? true : undefined}
                disabled={isSubmitting}
              />
              <button
                type="button"
                className={styles.toggleButton}
                onClick={() => setShowConfirm((v) => !v)}
                aria-label={showConfirm ? 'Hide confirm password' : 'Show confirm password'}
                tabIndex={-1}
              >
                <PasswordToggleIcon visible={showConfirm} />
              </button>
            </div>
            {confirmError && (
              <span id="confirm-pw-error" className={styles.fieldError} role="alert">
                {confirmError}
              </span>
            )}
          </div>

          {/* Password requirements */}
          <div id="pw-requirements" className={styles.requirements}>
            <p className={styles.requirementsTitle}>Password requirements</p>
            {COMPLEXITY_RULES.map((rule, i) => (
              <div
                key={i}
                className={`${styles.requirementItem} ${ruleResults[i] ? styles.requirementMet : ''}`}
              >
                <svg
                  className={styles.requirementIcon}
                  viewBox="0 0 16 16"
                  fill="none"
                  aria-hidden="true"
                >
                  {ruleResults[i] ? (
                    /* Checkmark */
                    <path
                      d="M3 8l3.5 3.5 6.5-7"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ) : (
                    /* Circle dot */
                    <circle cx="8" cy="8" r="2.5" fill="currentColor" />
                  )}
                </svg>
                {rule.label}
              </div>
            ))}
          </div>

          {/* Form-level error */}
          {formError && (
            <div className={styles.formError} role="alert">
              {formError}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            className={styles.submitButton}
            disabled={isSubmitting}
            aria-busy={isSubmitting}
          >
            {isSubmitting && <span className={styles.spinner} aria-hidden="true" />}
            {isSubmitting ? 'Saving…' : 'Set Password'}
          </button>
        </div>
      </form>
    </div>
  );
}
