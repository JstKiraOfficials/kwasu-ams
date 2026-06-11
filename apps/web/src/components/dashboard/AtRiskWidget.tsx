'use client';

/**
 * @file AtRiskWidget.tsx
 * @module components/dashboard/AtRiskWidget
 *
 * List of students below the 75% attendance threshold.
 * Each row shows matric number, name, percentage in danger colour,
 * and a "Warn" button that calls POST /notifications/warn-student.
 * The button disables on success to prevent duplicate sends.
 */

import { useState, useCallback, type ReactElement } from 'react';
import { apiPost } from '../../lib/api-client';
import styles from './AtRiskWidget.module.css';

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * A single at-risk student entry.
 */
export interface AtRiskStudent {
  /** UUID of the student record. */
  id: string;
  /** Student matric number. */
  matricNumber: string;
  /** Student full name. */
  fullName: string;
  /** Current attendance percentage (< 75 by definition). */
  percentage: number;
  /** Course code this at-risk entry relates to. */
  courseCode: string;
}

/**
 * Props for the {@link AtRiskWidget} component.
 */
export interface AtRiskWidgetProps {
  /** List of students at risk of being barred. */
  students: AtRiskStudent[];
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * At-risk student list widget.
 *
 * Renders a table-style list of students below the 75% threshold.
 * The "Warn" button POSTs to `/notifications/warn-student` and
 * disables itself on success to prevent duplicate notifications.
 *
 * @param props - {@link AtRiskWidgetProps}
 * @returns The rendered at-risk widget element.
 */
export function AtRiskWidget({ students }: AtRiskWidgetProps): ReactElement {
  const [warned, setWarned] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState<Set<string>>(new Set());

  /**
   * Sends a warning notification to a student and marks the button as done.
   *
   * @param studentId - UUID of the student to warn.
   */
  const handleWarn = useCallback(async (studentId: string): Promise<void> => {
    setLoading((prev) => new Set([...prev, studentId]));
    try {
      await apiPost('/notifications/warn-student', { studentId });
      setWarned((prev) => new Set([...prev, studentId]));
    } catch {
      // Silently fail — user can retry
    } finally {
      setLoading((prev) => {
        const next = new Set(prev);
        next.delete(studentId);
        return next;
      });
    }
  }, []);

  if (students.length === 0) {
    return (
      <div className={styles.empty}>
        <span>No students at risk — great work!</span>
      </div>
    );
  }

  return (
    <div className={styles.list} role="list" aria-label="At-risk students">
      {students.map((student) => (
        <div key={student.id} className={styles.row} role="listitem">
          <div className={styles.info}>
            <span className={styles.matric}>{student.matricNumber}</span>
            <span className={styles.name}>{student.fullName}</span>
            <span className={styles.course}>{student.courseCode}</span>
          </div>
          <div className={styles.right}>
            <span className={styles.percentage}>{(student.percentage ?? 0).toFixed(1)}%</span>
            <button
              type="button"
              className={`${styles.warnBtn} ${warned.has(student.id) ? styles.warnBtnDone : ''}`}
              onClick={() => {
                void handleWarn(student.id);
              }}
              disabled={warned.has(student.id) || loading.has(student.id)}
              aria-label={`Warn ${student.fullName}`}
            >
              {warned.has(student.id) ? 'Warned' : loading.has(student.id) ? '…' : 'Warn'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
