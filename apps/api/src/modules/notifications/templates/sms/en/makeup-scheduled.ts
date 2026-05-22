/**
 * @file makeup-scheduled.ts
 * @module modules/notifications/templates/sms/en
 * English SMS template: make-up class scheduled.
 */

/**
 * Renders the English SMS for a make-up class notification.
 * @param data - Template data containing `courseCode`, `date`, and `venue`.
 * @returns Formatted SMS string.
 */
export function render(data: Record<string, string>): string {
  return `Make-up class for ${data['courseCode']}: ${data['date']} at ${data['venue']}.`;
}
