/**
 * @file temp-password.ts
 * @module modules/notifications/templates/sms/en
 * English SMS template: temporary password delivery.
 */

/**
 * Renders the English SMS for temporary password delivery on account creation.
 * @param data - Template data containing `password` and `url`.
 * @returns Formatted SMS string.
 */
export function render(data: Record<string, string>): string {
  return `Your KWASU AMS temporary password is: ${data['password']}. Login at ${data['url']}. Change on first login.`;
}
