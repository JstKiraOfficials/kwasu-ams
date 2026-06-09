/**
 * @file not-found.tsx
 * @module app/not-found
 *
 * Next.js 404 Not Found page. Rendered automatically by the App Router
 * whenever a route segment cannot be matched. Provides a user-friendly
 * message and a link back to the home page.
 */

import Link from 'next/link';
import styles from './not-found.module.css';

/**
 * Renders the 404 Not Found page.
 *
 * Displayed by Next.js when no matching route is found. Shows a large
 * error code, a short explanation, and a navigation link back to `/`.
 *
 * @returns The 404 page JSX element.
 */
export default function NotFound(): React.JSX.Element {
  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <span className={styles.code}>404</span>
        <h1 className={styles.title}>Page not found</h1>
        <p className={styles.description}>
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link href="/" className={styles.link}>
          Go back home
        </Link>
      </div>
    </div>
  );
}
