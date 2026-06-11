'use client';

/**
 * @file layout.tsx
 * @module app/(auth)
 *
 * Auth route group layout — split-panel design.
 *
 * Desktop: left half is a full-height image panel with KWASU branding text
 * overlaid on a dark gradient. Right half is a scrollable form panel.
 *
 * Mobile: the background image fills the full viewport behind a dark scrim,
 * and the form card is centred on top of it.
 *
 * Uses a client-side mount gate (`mounted` state) to prevent server/client
 * hydration mismatches that cause React's `removeChild` crash.
 */

import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/providers/auth-provider';
import { AuthFlowProvider } from '@/providers/auth-flow-provider';
import styles from './layout.module.css';

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Props for the {@link AuthLayout} component.
 */
interface AuthLayoutProps {
  /** Auth page content rendered inside the form panel. */
  children: ReactNode;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Split-panel layout for all unauthenticated pages in the `(auth)` route group.
 *
 * Behaviour:
 * - Outer shell always renders identically on server and client to keep the
 *   DOM stable across hydration.
 * - Inner content is gated on `mounted` state (set after first client paint)
 *   to prevent hydration mismatches.
 * - Once mounted: authenticated users are redirected to `/dashboard` via
 *   `router.replace` (no back-button entry).
 *
 * Layout:
 * - Desktop (≥768px): left image panel + right form panel side by side.
 * - Mobile (<768px): background image + scrim fill the viewport, form card
 *   is centred on top.
 *
 * @param props - {@link AuthLayoutProps}
 * @returns The auth shell element — always an element, never `null`.
 */
export default function AuthLayout({ children }: AuthLayoutProps): ReactElement {
  const { user, isLoading } = useAuth();
  const isAuthenticated = user !== null;
  const router = useRouter();

  const [mounted, setMounted] = useState(false);
  /** Prevents the redirect from firing more than once per mount. */
  const redirected = useRef(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && !isLoading && isAuthenticated && !redirected.current) {
      redirected.current = true;
      router.replace('/dashboard');
    }
  }, [mounted, isLoading, isAuthenticated, router]);

  return (
    <AuthFlowProvider>
      <div className={styles.shell}>
        {/* ── Mobile: full-viewport background image ── */}
        <div className={styles.mobileBg} aria-hidden="true">
          <Image
            src="/background.jpg"
            alt=""
            fill
            priority
            className={styles.mobileBgImage}
            sizes="100vw"
          />
        </div>
        <div className={styles.mobileBgScrim} aria-hidden="true" />

        {/* ── Desktop: left image panel ── */}
        <div className={styles.imagePanelWrapper} aria-hidden="true">
          <Image
            src="/background.jpg"
            alt=""
            fill
            className={styles.backgroundImage}
            priority
            sizes="50vw"
          />
          <div className={styles.imageOverlay}>
            {/* Logo top-left */}
            <div className={styles.overlayLogo}>
              <Image
                src="/kwasuLogo.png"
                alt="KWASU logo"
                width={48}
                height={48}
                className={styles.overlayLogoImage}
              />
              <span className={styles.overlayLogoText}>KWASU AMS</span>
            </div>

            {/* Bottom branding text */}
            <h1 className={styles.overlayHeading}>
              Attendance,
              <br />
              Simplified.
            </h1>
            <p className={styles.overlaySubtext}>
              Kwara State University&apos;s mobile-first attendance management system — real-time,
              hardware-free, and built for every stakeholder.
            </p>
            <p className={styles.overlayFooter}>
              Kwara State University &mdash; Malete, Kwara State, Nigeria
            </p>
          </div>
        </div>

        {/* ── Right: form panel ── */}
        <div className={styles.formPanel}>
          {mounted && (!isAuthenticated || isLoading) && (
            <>
              {/* Mobile logo — shown above form on small screens */}
              <div className={styles.mobileLogo}>
                <Image
                  src="/kwasuLogo.png"
                  alt="KWASU logo"
                  width={40}
                  height={40}
                  className={styles.mobileLogoImage}
                />
                <span className={styles.mobileLogoText}>KWASU AMS</span>
              </div>

              {/* Form content */}
              <div className={styles.formContent}>{children}</div>

              {/* Mobile footer */}
              <p className={styles.mobileFooter}>
                Kwara State University &mdash; Malete, Kwara State, Nigeria
              </p>
            </>
          )}
        </div>
      </div>
    </AuthFlowProvider>
  );
}
