/**
 * @file layout.tsx
 * @module app/(auth)/layout
 *
 * Layout for the authentication route group `(auth)`.
 *
 * Renders a split-screen design for all auth pages (login, TOTP verify,
 * forgot password, reset password, setup TOTP):
 * - **Left panel** (`imagePanel`): full-height background photo with a
 *   KWASU green overlay and brand tagline. Hidden on mobile viewports.
 * - **Right panel** (`formPanel`): fixed-width white/dark surface that
 *   centres the auth form. Full-width on mobile.
 *
 * No sidebar or top navigation is rendered for auth pages.
 */

import styles from './layout.module.css';

/**
 * Props accepted by `AuthLayout`.
 */
interface AuthLayoutProps {
  /** The auth page content (login form, TOTP form, etc.). */
  children: React.ReactNode;
}

/**
 * Authentication group layout.
 *
 * Wraps all pages inside `(auth)/` with the split-screen shell. The left
 * image panel is hidden below 768 px so the form is full-width on mobile.
 *
 * @param props - `AuthLayoutProps` containing the page `children`.
 * @returns The split-screen auth shell JSX element.
 */
export default function AuthLayout({ children }: AuthLayoutProps): React.JSX.Element {
  return (
    <div className={styles.authShell}>
      {/* Left: decorative image panel — hidden on mobile */}
      <div className={styles.imagePanel} aria-hidden="true">
        <div className={styles.imageOverlay}>
          <p className={styles.imageTagline}>Smart Attendance for a Smarter Campus</p>
          <p className={styles.imageSubtext}>
            Kwara State University, Malete — Attendance Management System
          </p>
        </div>
      </div>

      {/* Right: form panel */}
      <main className={styles.formPanel}>{children}</main>
    </div>
  );
}
