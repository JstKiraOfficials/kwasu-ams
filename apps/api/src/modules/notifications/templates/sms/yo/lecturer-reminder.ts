/**
 * @file lecturer-reminder.ts
 * @module modules/notifications/templates/sms/yo
 * Yoruba SMS template: lecturer class reminder.
 */

/**
 * Renders the Yoruba SMS reminder for a lecturer's upcoming class.
 * @param data - Template data containing `courseCode` and `venue`.
 * @returns Formatted SMS string in Yoruba.
 */
export function render(data: Record<string, string>): string {
  return `Iranti: ${data['courseCode']} ni iṣẹju 30 ni ${data['venue']}.`;
}
