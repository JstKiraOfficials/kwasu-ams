/**
 * @file not-found.tsx
 * @module app
 *
 * Next.js App Router 404 Not Found page.
 * Rendered automatically by Next.js when `notFound()` is called or a route
 * does not match any segment. Provides a user-friendly message and a link
 * back to the dashboard.
 */

import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import Link from 'next/link';
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
 * Displayed when a user navigates to a route that does not exist.
 * Offers a link back to `/dashboard` so the user can recover without
 * using the browser back button.
 *
 * @returns The rendered 404 page element.
 */
export default function NotFound(): ReactElement {
  return (
    <div
      className={`flex flex-col items-center justify-center min-h-screen gap-4 ${styles.container}`}
    >
      <span className={styles.code}>404</span>
      <p className={styles.message}>The page you&apos;re looking for doesn&apos;t exist.</p>
      <Link href="/dashboard" className={styles.link}>
        Return to Dashboard
      </Link>
    </div>
  );
}
