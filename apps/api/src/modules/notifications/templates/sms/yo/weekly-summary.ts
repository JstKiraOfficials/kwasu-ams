/**
 * @file weekly-summary.ts
 * @module modules/notifications/templates/sms/yo
 * Yoruba SMS template: weekly attendance summary.
 */

/**
 * Renders the Yoruba SMS for a weekly attendance summary.
 * @param data - Template data containing `summary`.
 * @returns Formatted SMS string in Yoruba.
 */
export function render(data: Record<string, string>): string {
  return `Akopọ Ọsẹ: ${data['summary']}`;
}
