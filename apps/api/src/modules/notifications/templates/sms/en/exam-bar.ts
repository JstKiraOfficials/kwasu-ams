/**
 * @file exam-bar.ts
 * @module modules/notifications/templates/sms/en
 * English SMS template: student barred from exam.
 */

/**
 * Renders the English SMS for when a student is barred from an exam.
 * @param data - Template data containing `courseCode`.
 * @returns Formatted SMS string.
 */
export function render(data: Record<string, string>): string {
  return `You have been barred from the ${data['courseCode']} exam. Contact your lecturer.`;
}
