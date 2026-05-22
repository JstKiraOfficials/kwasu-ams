/**
 * @file excuse-decided.ts
 * @module modules/notifications/templates/sms/en
 * English SMS template: excuse letter decision.
 */

/**
 * Renders the English SMS for an excuse letter decision.
 * @param data - Template data containing `courseCode`, `date`, and `decision`.
 * @returns Formatted SMS string.
 */
export function render(data: Record<string, string>): string {
  return `Your excuse letter for ${data['courseCode']} on ${data['date']} has been ${data['decision']}.`;
}
