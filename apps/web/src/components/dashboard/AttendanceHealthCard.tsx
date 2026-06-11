'use client';

/**
 * @file AttendanceHealthCard.tsx
 * @module components/dashboard/AttendanceHealthCard
 *
 * Per-course attendance health card for the student dashboard.
 * Displays course code, title, present/total counts, percentage in
 * attendance-threshold colour, and a thin progress bar at the bottom.
 * Lifts 2px on hover with an increased shadow.
 */

import type { ReactElement } from 'react';
import styles from './AttendanceHealthCard.module.css';

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Props for the {@link AttendanceHealthCard} component.
 */
export interface AttendanceHealthCardProps {
  /** Course code (e.g. `'BIO 201'`). */
  courseCode: string;
  /** Full course title. */
  courseTitle: string;
  /** Number of sessions the student was present. */
  present: number;
  /** Total number of sessions held. */
  total: number;
  /** Attendance percentage (0–100). */
  percentage: number;
  /**
   * Stagger index for the entrance animation.
   * @defaultValue 0
   */
  index?: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Maps an attendance percentage to the correct CSS colour class.
 *
 * @param pct - Attendance percentage (0–100).
 * @returns One of `percentageSafe`, `percentageWarning`, or `percentageDanger`.
 */
function percentageClass(pct: number): string {
  if (pct >= 80) return styles.percentageSafe ?? '';
  if (pct >= 75) return styles.percentageWarning ?? '';
  return styles.percentageDanger ?? '';
}

/**
 * Maps an attendance percentage to a human-readable status label.
 *
 * @param pct - Attendance percentage (0–100).
 * @returns `'Safe'`, `'Warning'`, or `'At Risk'`.
 */
function statusLabel(pct: number): string {
  if (pct >= 80) return 'Safe';
  if (pct >= 75) return 'Warning';
  return 'At Risk';
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Student attendance health card for a single course.
 *
 * Colour-codes the percentage:
 * - ≥ 80% → `var(--color-att-safe)` — Safe
 * - 75–79% → `var(--color-att-warning)` — Warning
 * - < 75% → `var(--color-att-danger)` — At Risk
 *
 * @param props - {@link AttendanceHealthCardProps}
 * @returns The rendered attendance health card element.
 */
export function AttendanceHealthCard({
  courseCode,
  courseTitle,
  present,
  total,
  percentage,
  index = 0,
}: AttendanceHealthCardProps): ReactElement {
  const pctClass = percentageClass(percentage);
  const label = statusLabel(percentage);

  return (
    <div className={styles.card} style={{ '--i': index } as React.CSSProperties}>
      <div className={styles.header}>
        <span className={styles.courseCode}>{courseCode}</span>
        <span className={`${styles.statusBadge} ${pctClass}`}>{label}</span>
      </div>

      <p className={styles.courseTitle}>{courseTitle}</p>

      <div className={`${styles.percentage} ${pctClass}`}>{(percentage ?? 0).toFixed(1)}%</div>

      <div className={styles.sessionCount}>
        {present}/{total} sessions attended
      </div>

      <div className={styles.progressBar}>
        <div
          className={`${styles.progressFill} ${pctClass}`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
          role="progressbar"
          aria-valuenow={percentage}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${(percentage ?? 0).toFixed(1)}% attendance for ${courseCode}`}
        />
      </div>
    </div>
  );
}
