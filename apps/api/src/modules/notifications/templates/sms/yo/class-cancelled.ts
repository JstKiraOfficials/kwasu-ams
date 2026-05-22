/**
 * @file class-cancelled.ts
 * @module modules/notifications/templates/sms/yo
 * Yoruba SMS template: class cancelled.
 */

/**
 * Renders the Yoruba SMS for a class cancellation.
 * @param data - Template data containing `courseCode` and `time`.
 * @returns Formatted SMS string in Yoruba.
 */
export function render(data: Record<string, string>): string {
  return `Kilasi ${data['courseCode']} ni ${data['time']} ti fagile.`;
}
