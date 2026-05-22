/**
 * @file exam-bar.ts
 * @module modules/notifications/templates/sms/yo
 * Yoruba SMS template: student barred from exam.
 */

/**
 * Renders the Yoruba SMS for when a student is barred from an exam.
 * @param data - Template data containing `courseCode`.
 * @returns Formatted SMS string in Yoruba.
 */
export function render(data: Record<string, string>): string {
  return `A ti dẹkun ọ lati kọ idanwo ${data['courseCode']}. Kan si olukọ rẹ.`;
}
