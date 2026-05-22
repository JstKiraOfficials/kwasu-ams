/**
 * @file makeup-scheduled.ts
 * @module modules/notifications/templates/sms/yo
 * Yoruba SMS template: make-up class scheduled.
 */

/**
 * Renders the Yoruba SMS for a make-up class notification.
 * @param data - Template data containing `courseCode`, `date`, and `venue`.
 * @returns Formatted SMS string in Yoruba.
 */
export function render(data: Record<string, string>): string {
  return `Kilasi aropo fun ${data['courseCode']}: ${data['date']} ni ${data['venue']}.`;
}
