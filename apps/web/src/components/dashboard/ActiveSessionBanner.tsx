'use client';

/**
 * @file ActiveSessionBanner.tsx
 * @module components/dashboard/ActiveSessionBanner
 *
 * Full-width green banner displayed when the lecturer has an active session.
 * Shows the course code, live check-in count, and a link to the session page.
 */

import Link from 'next/link';
import type { ReactElement } from 'react';
import styles from './ActiveSessionBanner.module.css';

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Props for the {@link ActiveSessionBanner} component.
 */
export interface ActiveSessionBannerProps {
  /** UUID of the active session (used to build the link href). */
  sessionId: string;
  /** Course code displayed in the banner (e.g. `'BIO 201'`). */
  courseCode: string;
  /** Current number of students who have checked in. */
  checkinCount: number;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Active session banner.
 *
 * Renders a full-width green banner when the lecturer has a session in
 * ACTIVE status. Displays the course, live check-in count (updated via
 * WebSocket in the parent), and a "View session →" link.
 *
 * @param props - {@link ActiveSessionBannerProps}
 * @returns The rendered banner element.
 */
export function ActiveSessionBanner({
  sessionId,
  courseCode,
  checkinCount,
}: ActiveSessionBannerProps): ReactElement {
  return (
    <div className={styles.banner} role="status" aria-live="polite">
      <div className={styles.indicator} aria-hidden="true" />
      <span className={styles.text}>
        <strong>Session active:</strong> {courseCode} — {checkinCount} checked in
      </span>
      <Link href={`/sessions/${sessionId}`} className={styles.link}>
        View session →
      </Link>
    </div>
  );
}
