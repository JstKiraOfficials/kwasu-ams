/**
 * @file not-found.tsx
 * @module app
 *
 * Next.js App Router 404 Not Found page.
 * Rendered automatically by Next.js when `notFound()` is called or a route
 * does not match any segment. Provides a polished, branded error page with
 * a link back to `/login` (safe for both authenticated and unauthenticated users).
 */

import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import styles from './not-found.module.css';

/**
 * Next.js metadata for the 404 page.
 */
export const metadata: Metadata = {
  title: 'Page Not Found — KWASU AMS',
};

/**
 * 404 Not Found page component.
 *
 * Displays a branded full-screen error page with the KWASU logo, a large
 * "404" code, a friendly message, and a link back to `/login`.
 * Linking to `/login` rather than `/dashboard` is safe for both authenticated
 * and unauthenticated visitors — authenticated users are auto-redirected to
 * `/dashboard` by the auth layout on load.
 *
 * @returns The rendered 404 page element.
 */
export default function NotFound(): ReactElement {
  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <Image
          src="/kwasuLogo.png"
          alt="KWASU AMS"
          width={56}
          height={56}
          className={styles.logo}
          priority
        />

        <div className={styles.codeRow}>
          <span className={styles.code}>4</span>
          <span className={styles.codeZero}>0</span>
          <span className={styles.code}>4</span>
        </div>

        <h1 className={styles.heading}>Page not found</h1>
        <p className={styles.message}>
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>

        <Link href="/dashboard" className={styles.btn}>
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}
