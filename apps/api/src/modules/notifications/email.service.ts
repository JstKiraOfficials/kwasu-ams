/**
 * @file email.service.ts
 * @module modules/notifications
 *
 * Email notification service for KWASU AMS.
 *
 * Delegates to the `sendEmail` function from `lib/email-client.ts`.
 * In development the email client logs to console (stub). In production
 * it requires SMTP configuration via `SMTP_*` environment variables.
 *
 * Email failures are logged but never thrown — a failed email must not
 * block the application or the request cycle.
 */

import { sendEmail as clientSendEmail } from '../../lib/email-client.js';

/**
 * Sends an HTML email to the specified recipient.
 *
 * Delegates to the configured email client. Failures are caught, logged,
 * and swallowed — callers should not depend on this function throwing.
 *
 * @param to       - Recipient email address.
 * @param subject  - Email subject line.
 * @param htmlBody - HTML content for the email body.
 * @returns A promise that resolves once the send attempt completes.
 */
export async function sendEmail(to: string, subject: string, htmlBody: string): Promise<void> {
  try {
    await clientSendEmail(to, subject, htmlBody);
    console.info(`[Email] Sent to ${to} — "${subject}"`);
  } catch (err) {
    console.error(`[Email] Failed to send to ${to}:`, err);
  }
}
