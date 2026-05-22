/**
 * @file attendance-warning.ts
 * @module modules/notifications/templates/sms/en
 * English SMS template: attendance warning.
 */

/**
 * Renders the English SMS for an attendance warning.
 * @param data - Template data containing `courseCode` and `percentage`.
 * @returns Formatted SMS string.
 */
export function render(data: Record<string, string>): string {
  return `Warning: Your attendance in ${data['courseCode']} is now ${data['percentage']}%.`;
}
