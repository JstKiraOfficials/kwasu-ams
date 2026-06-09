/**
 * @file page.tsx
 * @module app/(auth)/setup-totp
 *
 * TOTP setup wizard. Three-step flow:
 *
 * 1. **Scan QR** — Calls `POST /auth/setup-totp` on mount, displays the QR
 *    code image and the manual secret with a copy button.
 * 2. **Confirm** — Accepts a 6-digit code and calls `POST /auth/confirm-totp`
 *    to verify enrolment.
 * 3. **Backup codes** — Calls `POST /auth/setup-totp/backup-codes` to fetch
 *    8 single-use codes. User must check the "I have saved..." checkbox before
 *    the Continue button is enabled. Continue navigates to `/dashboard`.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, CopyCheck } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { ApiError, apiPost } from '../../../lib/api-client';
import { useAuth } from '../../../hooks/use-auth';
import styles from './page.module.css';

/** The three wizard steps as a union type. */
type WizardStep = 1 | 2 | 3;

/**
 * Response from `POST /auth/setup-totp`.
 */
interface SetupTotpResponse {
  /** OTP Auth URI used to render the QR code (data URI from backend). */
  qrCodeUrl: string;
  /** Plain-text TOTP secret for manual entry. */
  secret: string;
}

/**
 * Response from `POST /auth/setup-totp/backup-codes`.
 */
interface BackupCodesResponse {
  /** Array of 8 single-use alphanumeric backup codes. */
  backupCodes: string[];
}

/**
 * Response from `POST /auth/confirm-totp`.
 */
interface ConfirmTotpResponse {
  /** Full JWT access token issued after successful TOTP enrolment. */
  accessToken: string;
  /** Refresh token — set as HttpOnly cookie by the API. */
  refreshToken?: string;
}

/**
 * TOTP setup wizard page component.
 *
 * Manages a three-step local state machine. Each step communicates with
 * a dedicated API endpoint. The wizard cannot go backwards — each step
 * must be completed in order.
 *
 * @returns The TOTP setup wizard page JSX element.
 */
export default function SetupTotpPage(): React.JSX.Element {
  const router = useRouter();
  const { interimToken, login } = useAuth();

  const [step, setStep] = useState<WizardStep>(1);
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secretCopied, setSecretCopied] = useState(false);
  const [allCopied, setAllCopied] = useState(false);
  const [savedChecked, setSavedChecked] = useState(false);

  // ── Step 1: fetch QR on mount ──────────────────────────────────────
  useEffect(() => {
    async function fetchQr(): Promise<void> {
      try {
        const data = await apiPost<SetupTotpResponse>('/auth/setup-totp', {
          interimToken,
        });
        setQrCodeUrl(data.qrCodeUrl);
        setSecret(data.secret);
      } catch {
        setError('Failed to load QR code. Please go back and try again.');
      }
    }
    void fetchQr();
  }, [interimToken]);

  /**
   * Copies the TOTP secret to the clipboard.
   */
  const handleCopySecret = useCallback(async (): Promise<void> => {
    await navigator.clipboard.writeText(secret);
    setSecretCopied(true);
    setTimeout(() => setSecretCopied(false), 2000);
  }, [secret]);

  /**
   * Copies all backup codes to the clipboard as a newline-separated string.
   */
  const handleCopyAll = useCallback(async (): Promise<void> => {
    await navigator.clipboard.writeText(backupCodes.join('\n'));
    setAllCopied(true);
    setTimeout(() => setAllCopied(false), 2000);
  }, [backupCodes]);

  /**
   * Confirms the TOTP enrolment by submitting the 6-digit code.
   * On success, fetches backup codes and advances to step 3.
   *
   * @param e - The form submit event.
   */
  const handleConfirm = useCallback(
    async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
      e.preventDefault();
      setError(null);
      setIsLoading(true);
      try {
        const data = await apiPost<ConfirmTotpResponse>('/auth/confirm-totp', {
          code,
          interimToken,
        });
        // Store access token so subsequent calls (backup-codes) are authenticated
        await login(data.accessToken, data.refreshToken ?? '');

        const codesData = await apiPost<BackupCodesResponse>('/auth/setup-totp/backup-codes', {});
        setBackupCodes(codesData.backupCodes);
        setStep(3);
      } catch (err) {
        if (err instanceof ApiError) {
          setError('Invalid code. Please check your authenticator app and try again.');
        } else {
          setError('An unexpected error occurred. Please try again.');
        }
      } finally {
        setIsLoading(false);
      }
    },
    [code, interimToken, login],
  );

  /**
   * Handles digit-only input for the confirmation code field.
   *
   * @param e - The change event from the code input.
   */
  const handleCodeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>): void => {
    setCode(e.target.value.replace(/\D/g, '').slice(0, 6));
    setError(null);
  }, []);

  return (
    <div className={styles.card}>
      {/* Logo */}
      <div className={styles.logoWrap}>
        <div className={styles.logoMark} aria-label="KWASU AMS">
          KA
        </div>
      </div>

      {/* Step indicator dots */}
      <div className={styles.stepIndicator} aria-label={`Step ${step} of 3`}>
        {([1, 2, 3] as WizardStep[]).map((s) => (
          <div
            key={s}
            className={`${styles.stepDot} ${step >= s ? styles.stepDotActive : ''}`}
            aria-hidden="true"
          />
        ))}
      </div>

      {/* ── Step 1: Scan QR ─────────────────────────────────────────── */}
      {step === 1 && (
        <>
          <div className={styles.heading}>
            <h1 className={styles.title}>Secure your account</h1>
            <p className={styles.subtitle}>
              Scan the QR code with your authenticator app (Google Authenticator, Authy, etc.) to
              enable two-factor authentication.
            </p>
          </div>

          {qrCodeUrl && (
            <div className={styles.qrWrap}>
              <img
                src={qrCodeUrl}
                alt="TOTP QR code — scan with your authenticator app"
                width={200}
                height={200}
                className={styles.qrImage}
              />
            </div>
          )}

          {secret && (
            <div className={styles.secretCard}>
              <span className={styles.secretText}>{secret}</span>
              <button
                type="button"
                className={styles.copyBtn}
                onClick={() => void handleCopySecret()}
                aria-label={secretCopied ? 'Secret copied' : 'Copy secret'}
              >
                {secretCopied ? (
                  <CopyCheck size={16} strokeWidth={1.75} aria-hidden="true" />
                ) : (
                  <Copy size={16} strokeWidth={1.75} aria-hidden="true" />
                )}
              </button>
            </div>
          )}

          {error && (
            <p className={styles.errorText} role="alert">
              {error}
            </p>
          )}

          <Button
            type="button"
            variant="primary"
            fullWidth
            onClick={() => setStep(2)}
            disabled={!qrCodeUrl}
          >
            I&apos;ve scanned the code
          </Button>
        </>
      )}

      {/* ── Step 2: Confirm code ─────────────────────────────────────── */}
      {step === 2 && (
        <>
          <div className={styles.heading}>
            <h1 className={styles.title}>Confirm your code</h1>
            <p className={styles.subtitle}>
              Enter the 6-digit code from your authenticator app to complete setup.
            </p>
          </div>

          <form className={styles.form} onSubmit={(e) => void handleConfirm(e)} noValidate>
            <div className={styles.codeInputWrap}>
              <input
                className={styles.codeInput}
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={handleCodeChange}
                aria-label="6-digit confirmation code"
                autoComplete="one-time-code"
                autoFocus
              />
            </div>

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
              Confirm
            </Button>
          </form>
        </>
      )}

      {/* ── Step 3: Backup codes ─────────────────────────────────────── */}
      {step === 3 && (
        <>
          <div className={styles.heading}>
            <h1 className={styles.title}>Save your backup codes</h1>
            <p className={styles.subtitle}>
              Store these codes somewhere safe. Each can be used once if you lose access to your
              authenticator app. They will not be shown again.
            </p>
          </div>

          <div className={styles.codesGrid} aria-label="Backup recovery codes">
            {backupCodes.map((c) => (
              <div key={c} className={styles.codeCell} title="Click to select">
                {c}
              </div>
            ))}
          </div>

          <button type="button" className={styles.copyAllBtn} onClick={() => void handleCopyAll()}>
            {allCopied ? (
              <CopyCheck size={14} strokeWidth={1.75} aria-hidden="true" />
            ) : (
              <Copy size={14} strokeWidth={1.75} aria-hidden="true" />
            )}
            {allCopied ? 'Copied!' : 'Copy all codes'}
          </button>

          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={savedChecked}
              onChange={(e) => setSavedChecked(e.target.checked)}
              aria-label="I have saved my backup codes in a safe place"
            />
            I have saved my backup codes in a safe place.
          </label>

          <Button
            type="button"
            variant="primary"
            fullWidth
            disabled={!savedChecked}
            onClick={() => router.push('/dashboard')}
          >
            Continue to dashboard
          </Button>
        </>
      )}
    </div>
  );
}
