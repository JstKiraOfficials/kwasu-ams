/**
 * @file lecturer-reminder.ts
 * @module modules/notifications/templates/sms/en
 * English SMS template: lecturer class reminder.
 */

/**
 * Renders the English SMS reminder for a lecturer's upcoming class.
 * @param data - Template data containing `courseCode` and `venue`.
 * @returns Formatted SMS string.
 */
export function render(data: Record<string, string>): string {
  return `Reminder: ${data['courseCode']} in 30 minutes at ${data['venue']}.`;
}
