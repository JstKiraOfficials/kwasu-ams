/**
 * @file session-open.ts
 * @module modules/notifications/templates/sms/en
 *
 * English SMS template: attendance session opened.
 */

/**
 * Renders the English SMS for when a lecturer opens an attendance session.
 *
 * @param data - Template data containing `courseCode`.
 * @returns Formatted SMS string.
 */
export function render(data: Record<string, string>): string {
  return `Attendance is now open for ${data['courseCode']}. Check in now.`;
}
