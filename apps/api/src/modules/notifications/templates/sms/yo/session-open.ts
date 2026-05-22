/**
 * @file session-open.ts
 * @module modules/notifications/templates/sms/yo
 * Yoruba SMS template: attendance session opened.
 */

/**
 * Renders the Yoruba SMS for when a lecturer opens an attendance session.
 * @param data - Template data containing `courseCode`.
 * @returns Formatted SMS string in Yoruba.
 */
export function render(data: Record<string, string>): string {
  return `Iforukọsilẹ wiwa ti ṣii fun ${data['courseCode']}. Forukọsilẹ bayi.`;
}
