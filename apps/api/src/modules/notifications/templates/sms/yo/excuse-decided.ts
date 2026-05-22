/**
 * @file excuse-decided.ts
 * @module modules/notifications/templates/sms/yo
 * Yoruba SMS template: excuse letter decision.
 */

/**
 * Renders the Yoruba SMS for an excuse letter decision.
 * @param data - Template data containing `courseCode`, `date`, and `decision`.
 * @returns Formatted SMS string in Yoruba.
 */
export function render(data: Record<string, string>): string {
  return `Lẹta idariji rẹ fun ${data['courseCode']} ni ${data['date']} ti jẹ ${data['decision']}.`;
}
