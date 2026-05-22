/**
 * @file marked-absent.ts
 * @module modules/notifications/templates/sms/yo
 * Yoruba SMS template: student marked absent.
 */

/**
 * Renders the Yoruba SMS for when a student is marked absent.
 * @param data - Template data containing `courseCode` and `date`.
 * @returns Formatted SMS string in Yoruba.
 */
export function render(data: Record<string, string>): string {
  return `A samọ ọ si isansa fun ${data['courseCode']} ni ${data['date']}.`;
}
