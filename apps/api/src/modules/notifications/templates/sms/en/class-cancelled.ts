/**
 * @file class-cancelled.ts
 * @module modules/notifications/templates/sms/en
 * English SMS template: class cancelled.
 */

/**
 * Renders the English SMS for a class cancellation.
 * @param data - Template data containing `courseCode` and `time`.
 * @returns Formatted SMS string.
 */
export function render(data: Record<string, string>): string {
  return `${data['courseCode']} class at ${data['time']} has been cancelled.`;
}
