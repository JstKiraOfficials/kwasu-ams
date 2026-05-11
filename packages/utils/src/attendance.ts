import { ATTENDANCE_THRESHOLD_SAFE, ATTENDANCE_THRESHOLD_NUC } from './constants/attendance.js';

/**
 * Computes attendance percentage rounded to 2 decimal places.
 * Returns 0 if total is 0 (no division by zero).
 */
export function computeAttendancePercentage(present: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((present / total) * 100 * 100) / 100;
}

/**
 * Returns the colour-coded attendance status for a given percentage.
 * Matches the CSS token thresholds: safe ≥80%, warning 75–79%, danger <75%.
 */
export function getAttendanceStatus(percentage: number): 'safe' | 'warning' | 'danger' {
  if (percentage >= ATTENDANCE_THRESHOLD_SAFE) return 'safe';
  if (percentage >= ATTENDANCE_THRESHOLD_NUC) return 'warning';
  return 'danger';
}

/**
 * Computes how many of the remaining sessions a student must attend to reach the threshold.
 * Returns 0 if already at or above threshold.
 * Returns a negative number if it is impossible to reach the threshold.
 */
export function classesNeededForThreshold(
  currentPresent: number,
  totalSessions: number,
  remainingSessions: number,
  threshold: number,
): number {
  const requiredPresent = Math.ceil((threshold / 100) * (totalSessions + remainingSessions));
  const needed = requiredPresent - currentPresent;
  return Math.max(0, needed);
}

/**
 * Projects the final attendance percentage if the student attends all remaining sessions.
 */
export function projectFinalPercentage(
  currentPresent: number,
  totalSessions: number,
  remainingSessions: number,
): number {
  return computeAttendancePercentage(
    currentPresent + remainingSessions,
    totalSessions + remainingSessions,
  );
}
