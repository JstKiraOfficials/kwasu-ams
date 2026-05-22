/**
 * @file attendance-warning.ts
 * @module modules/notifications/templates/sms/yo
 * Yoruba SMS template: attendance warning.
 */

/**
 * Renders the Yoruba SMS for an attendance warning.
 * @param data - Template data containing `courseCode` and `percentage`.
 * @returns Formatted SMS string in Yoruba.
 */
export function render(data: Record<string, string>): string {
  return `Ikilọ: Wiwa rẹ ni ${data['courseCode']} jẹ ${data['percentage']}% bayi.`;
}
