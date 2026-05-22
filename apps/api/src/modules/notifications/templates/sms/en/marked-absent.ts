/**
 * @file marked-absent.ts
 * @module modules/notifications/templates/sms/en
 * English SMS template: student marked absent.
 */

/**
 * Renders the English SMS for when a student is marked absent.
 * @param data - Template data containing `courseCode` and `date`.
 * @returns Formatted SMS string.
 */
export function render(data: Record<string, string>): string {
  return `You were marked absent for ${data['courseCode']} on ${data['date']}.`;
}
