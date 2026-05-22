/**
 * @file weekly-summary.ts
 * @module modules/notifications/templates/sms/en
 * English SMS template: weekly attendance summary.
 */

/**
 * Renders the English SMS for a weekly attendance summary.
 * @param data - Template data containing `summary`.
 * @returns Formatted SMS string.
 */
export function render(data: Record<string, string>): string {
  return `Weekly Summary: ${data['summary']}`;
}
