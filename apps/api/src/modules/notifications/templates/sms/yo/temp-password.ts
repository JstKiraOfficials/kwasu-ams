/**
 * @file temp-password.ts
 * @module modules/notifications/templates/sms/yo
 * Yoruba SMS template: temporary password delivery.
 */

/**
 * Renders the Yoruba SMS for temporary password delivery on account creation.
 * @param data - Template data containing `password` and `url`.
 * @returns Formatted SMS string in Yoruba.
 */
export function render(data: Record<string, string>): string {
  return `Ọrọ igbaniwọle igba diẹ KWASU AMS rẹ ni: ${data['password']}. Wọle ni ${data['url']}. Yipada ni igba akọkọ.`;
}
