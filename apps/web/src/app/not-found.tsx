'use client';

/**
 * @file not-found.tsx
 * @module app
 *
 * Next.js App Router 404 Not Found page.
 *
 * Rendered automatically by Next.js when `notFound()` is called or a route
 * does not match any segment.
 *
 * This is a Client Component so it can read `AuthContext` directly and route
 * the "Go to Dashboard" button to the correct destination without any
 * intermediate redirect hop:
 * - While session is recovering (`isLoading`): button is disabled so the user
 *   cannot navigate before auth state is known.
 * - Authenticated users (`user !== null`): button links directly to `/dashboard`.
 * - Unauthenticated users: button links to `/login`.
 *
 * This avoids the race condition where `user` is transiently `null` during
 * session recovery and the link resolves to `/login` prematurely.
 */

import type { ReactElement } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/providers/auth-provider';
import styles from './not-found.module.css';

/**
 * 404 Not Found page component.
 *
 * Waits for `AuthProvider` to finish recovering the session before resolving
 * the button destination. This prevents the user from being sent to `/login`
 * simply because the access token hadn't been restored yet when they clicked.
 *
 * Behaviour:
 * - `isLoading === true`: renders the button in a disabled/pending state.
 * - `user !== null`: button href is `/dashboard` — direct navigation, no hop.
 * - `user === null`: button href is `/login` — correct for unauthenticated visitors.
 *
 * @returns The rendered 404 page element.
 */
export default function NotFound(): ReactElement {
  const { user, isLoading } = useAuth();

  // Don't resolve the destination until auth state is known.
  // This prevents a click during session recovery from going to /login.
  const href = isLoading ? undefined : user !== null ? '/dashboard' : '/login';

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

        {href !== undefined ? (
          <Link href={href} className={styles.btn}>
            Go to Dashboard
          </Link>
        ) : (
          <span className={styles.btn} aria-busy="true" aria-disabled="true">
            Go to Dashboard
          </span>
        )}
      </div>
    </div>
  );
}
