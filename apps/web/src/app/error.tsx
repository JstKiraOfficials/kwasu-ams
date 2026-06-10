'use client';

/**
 * @file error.tsx
 * @module app
 *
 * Next.js App Router global error boundary page.
 * Rendered automatically when an unhandled error is thrown during rendering
 * in any route segment. Must be a Client Component (`'use client'`) because
 * it receives the `error` and `reset` props from the React error boundary.
 *
 * Displays a user-friendly error message and a "Try again" button that
 * calls `reset()` to attempt re-rendering the failed segment.
 */

import { useEffect, type ReactElement } from 'react';
import styles from './error.module.css';

/**
 * Props for the {@link GlobalError} component, provided by Next.js.
 */
interface ErrorPageProps {
  /** The error that was thrown. May have a `digest` property added by Next.js. */
  error: Error & { digest?: string };
  /** Resets the error boundary and attempts to re-render the failed segment. */
  reset: () => void;
}

/**
 * Global error boundary page for the Next.js App Router.
 *
 * Logs the error to the console on mount (Sentry integration added in a later
 * phase). Renders a centred card with the error message and a retry button.
 *
 * @param props - {@link ErrorPageProps} injected by Next.js.
 * @returns The rendered error page element.
 */
export default function GlobalError({ error, reset }: ErrorPageProps): ReactElement {
  useEffect(() => {
    // TODO(Phase 38): replace with Sentry.captureException(error)
    console.error('[GlobalError]', error);
  }, [error]);

  return (
    <div
      className={`flex flex-col items-center justify-center min-h-screen gap-4 ${styles.container}`}
    >
      <span className={styles.icon} aria-hidden="true">
        ⚠
      </span>
      <h1 className={styles.heading}>Something went wrong</h1>
      <p className={styles.message}>
        {error.message || 'An unexpected error occurred. Please try again.'}
      </p>
      {error.digest && <p className={styles.digest}>Error ID: {error.digest}</p>}
      <button type="button" className={styles.retryBtn} onClick={reset}>
        Try again
      </button>
    </div>
  );
}
