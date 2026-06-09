/**
 * @file layout.tsx
 * @module app/(app)/layout
 *
 * Layout for the authenticated application route group `(app)`.
 *
 * Wraps every app page (dashboard, sessions, attendance, etc.) in the
 * `AppShell` component, which renders the persistent sidebar and top
 * navigation bar. Redirects unauthenticated visitors to `/login` while
 * the session is still being recovered, and renders a full-screen loading
 * indicator during that recovery window.
 *
 * This layout is a Client Component because it reads from `AuthContext`
 * and applies conditional rendering based on auth state.
 */

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../hooks/use-auth';
import { AppShell } from '../../components/layout/AppShell';
import styles from './layout.module.css';

/**
 * Props accepted by `AppLayout`.
 */
interface AppLayoutProps {
  /** The authenticated page content to render inside the `AppShell`. */
  children: React.ReactNode;
}

/**
 * Authenticated application group layout.
 *
 * Behaviour:
 * - While `isLoading` is `true` (initial session recovery): renders a
 *   full-screen spinner so pages do not flash unauthenticated content.
 * - When loading is complete and `user` is `null`: redirects to `/login`.
 * - When `user` is present: renders the full `AppShell` with the page.
 *
 * @param props - `AppLayoutProps` containing the nested page `children`.
 * @returns The authenticated shell, a loading screen, or `null` during redirect.
 */
export default function AppLayout({ children }: AppLayoutProps): React.JSX.Element | null {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && user === null) {
      router.replace('/login');
    }
  }, [isLoading, user, router]);

  // Show spinner while recovering session
  if (isLoading) {
    return (
      <div className={styles.loadingScreen} aria-busy="true" aria-label="Loading application">
        <div className={styles.spinner} aria-hidden="true" />
      </div>
    );
  }

  // Render nothing while redirect is in-flight
  if (!user) return null;

  return <AppShell user={user}>{children}</AppShell>;
}
