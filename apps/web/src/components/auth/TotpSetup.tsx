'use client';

/**
 * @file TotpSetup.tsx
 * @module components/auth
 *
 * TOTP enrollment wizard for the KWASU AMS web application.
 *
 * Implements a three-step wizard:
 *   Step 1 — Scan QR: displays a 200×200px QR code (via `qrcode.react`) and
 *             a collapsible manual-entry fallback showing the raw TOTP secret.
 *   Step 2 — Confirm code: 6-digit input to verify the user has scanned
 *             correctly. Calls `POST /auth/confirm-totp`.
 *   Step 3 — Backup codes: displays 8 single-use recovery codes in a 2×4
 *             grid. "Continue" button is disabled until the confirmation
 *             checkbox is checked.
 *
 * On mount, calls `POST /auth/setup-totp` to retrieve `qrCodeUri` and
 * `secret`. The backup codes are returned by `POST /auth/confirm-totp`.
 */

import { useState, useEffect, useCallback, useRef, type FormEvent, type ReactElement } from 'react';
import { useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { apiPost, ApiError } from '@/lib/api-client';
import { useAuthFlow } from '@/providers/auth-flow-provider';
import styles from './TotpSetup.module.css';

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Shape of the response returned by `POST /auth/setup-totp`.
 */
interface SetupTotpResponse {
  /** `otpauth://` URI used to render the QR code. */
  qrCodeUri: string;
  /** Plaintext TOTP secret for manual entry into authenticator apps. */
  secret: string;
}

/**
 * Shape of the response returned by `POST /auth/confirm-totp`.
 */
interface ConfirmTotpResponse {
  /** Eight single-use backup recovery codes shown once to the user. */
  backupCodes: string[];
}

/**
 * The three steps of the TOTP setup wizard.
 */
type WizardStep = 1 | 2 | 3;

/**
 * Props for the {@link TotpSetup} component.
 *
 * @property interimToken - The interim token received after `POST /auth/login`.
 *   Required to authenticate the setup and confirm requests.
 */
export interface TotpSetupProps {
  /** Interim token from the preceding login step, held in memory. */
  interimToken?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Three-step TOTP enrollment wizard component.
 *
 * Step 1: Fetches the QR code URI from `POST /auth/setup-totp` on mount and
 * renders a 200×200px SVG QR code. A collapsible section reveals the raw
 * secret for manual entry. Advances to Step 2 on "Next".
 *
 * Step 2: Renders a 6-digit code input. On submit, calls
 * `POST /auth/confirm-totp`. On success, transitions to Step 3 with the
 * returned backup codes.
 *
 * Step 3: Displays 8 backup codes in a 2×4 grid. Provides a "Copy all"
 * button. The "Continue to login" button is disabled until the user checks
 * the confirmation checkbox.
 *
 * @param props - {@link TotpSetupProps}
 * @returns The rendered TOTP setup wizard element.
 */
export function TotpSetup({ interimToken }: TotpSetupProps): ReactElement {
  const router = useRouter();
  const { interimToken: contextToken } = useAuthFlow();

  // Prefer the prop (backward compat) then fall back to context
  const token = interimToken ?? contextToken ?? undefined;

  // ── Wizard step ───────────────────────────────────────────────────────────
  const [step, setStep] = useState<WizardStep>(1);

  // ── Step 1 state ──────────────────────────────────────────────────────────
  const [qrCodeUri, setQrCodeUri] = useState('');
  const [secret, setSecret] = useState('');
  const [showManual, setShowManual] = useState(false);
  const [setupLoading, setSetupLoading] = useState(true);
  const [setupError, setSetupError] = useState('');

  // ── Step 2 state ──────────────────────────────────────────────────────────
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [confirmError, setConfirmError] = useState('');
  const [isConfirming, setIsConfirming] = useState(false);

  // ── Step 3 state ──────────────────────────────────────────────────────────
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [savedChecked, setSavedChecked] = useState(false);

  // ── Auto-focus code input on step 2 ──────────────────────────────────────
  const codeInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (step === 2) {
      codeInputRef.current?.focus();
    }
  }, [step]);

  // ── Fetch QR on mount ─────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function fetchSetup(): Promise<void> {
      try {
        const data = await apiPost<SetupTotpResponse>('/auth/setup-totp', {
          interimToken: token,
        });
        if (cancelled) return;
        setQrCodeUri(data.qrCodeUri);
        setSecret(data.secret);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError) {
          setSetupError(err.message);
        } else {
          setSetupError('Failed to load QR code. Please refresh and try again.');
        }
      } finally {
        if (!cancelled) setSetupLoading(false);
      }
    }

    void fetchSetup();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // ── Step 2: confirm code ──────────────────────────────────────────────────

  /**
   * Restricts the TOTP code input to digits only, capped at 6 characters.
   *
   * @param value - The raw input string from the change event.
   */
  const handleCodeChange = useCallback(
    (value: string): void => {
      const digits = value.replace(/\D/g, '').slice(0, 6);
      setCode(digits);
      if (codeError) setCodeError('');
    },
    [codeError],
  );

  /**
   * Submits the 6-digit TOTP confirmation code to `POST /auth/confirm-totp`.
   * On success, stores the backup codes and advances to Step 3.
   *
   * @param e - The form submit event.
   */
  const handleConfirmSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>): Promise<void> => {
      e.preventDefault();
      setConfirmError('');

      if (code.length !== 6) {
        setCodeError('Please enter all 6 digits.');
        return;
      }

      setIsConfirming(true);
      try {
        const data = await apiPost<ConfirmTotpResponse>('/auth/confirm-totp', {
          code,
          interimToken: token,
        });
        setBackupCodes(data.backupCodes);
        setStep(3);
      } catch (err) {
        if (err instanceof ApiError) {
          setConfirmError(err.message);
        } else {
          setConfirmError('An unexpected error occurred. Please try again.');
        }
        setCode('');
        codeInputRef.current?.focus();
      } finally {
        setIsConfirming(false);
      }
    },
    [code, interimToken],
  );

  // ── Step 3: copy all codes ────────────────────────────────────────────────

  /**
   * Copies all backup codes to the clipboard as a newline-separated string.
   * Updates the button label briefly to confirm the copy.
   */
  const handleCopyAll = useCallback(async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(backupCodes.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard API unavailable — silently ignore
    }
  }, [backupCodes]);

  // ── Render ────────────────────────────────────────────────────────────────

  /**
   * Returns the CSS modifier class for a step indicator dot.
   *
   * @param s - The step number this dot represents.
   * @returns A CSS module class string for the dot's current state.
   */
  const stepDotClass = (s: WizardStep): string => {
    if (step === s) return styles.stepDotActive ?? '';
    if (step > s) return styles.stepDotComplete ?? '';
    return '';
  };

  return (
    <div className={styles.container}>
      {/* Step indicator */}
      <div className={styles.stepIndicator} aria-label="Setup progress">
        {([1, 2, 3] as WizardStep[]).map((s) => (
          <div
            key={s}
            className={`${styles.stepDot} ${stepDotClass(s)}`}
            aria-label={`Step ${s}${step === s ? ' (current)' : step > s ? ' (complete)' : ''}`}
          />
        ))}
      </div>

      {/* ── Step 1: Scan QR ──────────────────────────────────────────── */}
      {step === 1 && (
        <>
          <h1 className={styles.heading}>Set Up Two-Factor Authentication</h1>
          <p className={styles.instruction}>
            Scan this QR code with Google Authenticator, Microsoft Authenticator, or any TOTP app.
          </p>

          <div className={styles.qrWrapper}>
            <div className={styles.qrContainer}>
              {setupLoading && <span className={styles.spinner} aria-label="Loading QR code…" />}
              {setupError && <p className={styles.fieldError}>{setupError}</p>}
              {!setupLoading && !setupError && qrCodeUri && (
                <QRCodeSVG
                  value={qrCodeUri}
                  size={168}
                  aria-label="TOTP QR code — scan with your authenticator app"
                />
              )}
            </div>
          </div>

          {/* Manual entry toggle */}
          {!setupLoading && !setupError && (
            <>
              <button
                type="button"
                className={styles.manualToggle}
                onClick={() => setShowManual((v) => !v)}
                aria-expanded={showManual}
                aria-controls="manual-secret"
              >
                {showManual ? 'Hide manual entry key' : "Can't scan? Enter key manually"}
              </button>

              {showManual && (
                <div id="manual-secret" className={styles.manualEntry}>
                  <p className={styles.manualLabel}>Account key</p>
                  <p className={styles.manualSecret} aria-label="Manual TOTP secret key">
                    {secret}
                  </p>
                </div>
              )}
            </>
          )}

          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => setStep(2)}
            disabled={setupLoading || !!setupError}
          >
            Next
          </button>
        </>
      )}

      {/* ── Step 2: Confirm code ──────────────────────────────────────── */}
      {step === 2 && (
        <>
          <h1 className={styles.heading}>Confirm Your Code</h1>
          <p className={styles.instruction}>
            Enter the 6-digit code from your authenticator app to confirm setup.
          </p>

          <form
            onSubmit={(e) => {
              void handleConfirmSubmit(e);
            }}
            noValidate
          >
            <div className={styles.fieldStack}>
              <div className={styles.fieldGroup}>
                <input
                  ref={codeInputRef}
                  id="confirm-totp-code"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  autoComplete="one-time-code"
                  placeholder="000000"
                  value={code}
                  onChange={(e) => handleCodeChange(e.target.value)}
                  className={`${styles.codeInput} ${codeError ? styles.codeInputError : ''}`}
                  aria-label="6-digit TOTP confirmation code"
                  aria-describedby={codeError ? 'confirm-code-error' : undefined}
                  aria-invalid={codeError ? true : undefined}
                  disabled={isConfirming}
                />
                {codeError && (
                  <span id="confirm-code-error" className={styles.fieldError} role="alert">
                    {codeError}
                  </span>
                )}
              </div>

              {confirmError && (
                <div className={styles.formError} role="alert">
                  {confirmError}
                </div>
              )}

              <button
                type="submit"
                className={styles.primaryButton}
                disabled={isConfirming || code.length !== 6}
                aria-busy={isConfirming}
              >
                {isConfirming && <span className={styles.spinner} aria-hidden="true" />}
                {isConfirming ? 'Confirming…' : 'Confirm Setup'}
              </button>
            </div>
          </form>
        </>
      )}

      {/* ── Step 3: Backup codes ──────────────────────────────────────── */}
      {step === 3 && (
        <>
          <h1 className={styles.heading}>Save Your Backup Codes</h1>

          <div className={styles.warningBanner} role="alert">
            These codes will only be shown once. Store them safely.
          </div>

          <div className={styles.codesGrid} aria-label="Backup recovery codes">
            {backupCodes.map((c) => (
              <div key={c} className={styles.codeChip}>
                {c}
              </div>
            ))}
          </div>

          <button
            type="button"
            className={`${styles.copyButton} ${copied ? styles.copyButtonDone : ''}`}
            onClick={() => {
              void handleCopyAll();
            }}
          >
            {copied ? '✓ Copied!' : 'Copy all codes'}
          </button>

          <label className={styles.checkboxRow}>
            <input
              type="checkbox"
              className={styles.checkbox}
              checked={savedChecked}
              onChange={(e) => setSavedChecked(e.target.checked)}
              aria-label="I have saved my backup codes in a safe place"
            />
            <span className={styles.checkboxLabel}>
              I have saved my backup codes in a safe place.
            </span>
          </label>

          <button
            type="button"
            className={styles.primaryButton}
            disabled={!savedChecked}
            onClick={() => router.push('/verify-totp')}
          >
            Continue to login
          </button>
        </>
      )}
    </div>
  );
}
