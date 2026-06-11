/**
 * @file uptime.ts
 * @module lib/uptime
 *
 * Provides a human-readable system uptime string measured from the moment
 * this module was first loaded.
 *
 * Using a module-level timestamp instead of `process.uptime()` ensures the
 * value survives `tsx watch` hot-reloads, which reset `process.uptime()` to
 * near-zero on every file change while the OS process keeps running.
 */

/**
 * Timestamp (ms since epoch) recorded when this module was first imported.
 * Persists for the lifetime of the Node.js process regardless of hot reloads.
 */
const START_TIME_MS: number = Date.now();

/**
 * Returns the time elapsed since this module was first loaded as a
 * human-readable string.
 *
 * Formats the elapsed time into the largest two non-zero units:
 * days + hours, hours + minutes, or minutes + seconds.
 *
 * Examples:
 * - 14 days 3 hours → `'14d 3h'`
 * - 2 hours 45 min  → `'2h 45m'`
 * - 32 min 10 sec   → `'32m 10s'`
 *
 * @returns A human-readable uptime string such as `'3d 12h'` or `'45m 6s'`.
 */
export function getUptime(): string {
  const totalSeconds = Math.floor((Date.now() - START_TIME_MS) / 1_000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${seconds}s`;
}
