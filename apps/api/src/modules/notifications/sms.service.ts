/**
 * @file sms.service.ts
 * @module modules/notifications
 *
 * SMS notification service for KWASU AMS.
 *
 * Wraps `getSmsClient()` from `lib/sms-client.ts`. SMS failures are logged
 * but never thrown — a failed SMS must not block the application.
 *
 * SMS is the primary notification channel for KWASU AMS (many students may
 * not have smartphones or reliable internet access).
 */

import { getSmsClient } from '../../lib/sms-client.js';

/**
 * Sends an SMS message to the specified phone number.
 *
 * Delegates to the configured SMS provider (AfricasTalking or Termii).
 * Failures are logged and swallowed — callers should not depend on this
 * function throwing on failure.
 *
 * @param phone   - Recipient phone number in international format (e.g. `+2348012345678`).
 * @param message - SMS message body. Keep under 160 characters for single-part delivery.
 * @returns A promise that resolves once the send attempt completes.
 */
export async function sendSms(phone: string, message: string): Promise<void> {
  const client = getSmsClient();
  const result = await client.sendSms(phone, message);

  if (result.success) {
    console.info(`[SMS] Delivered to ${phone} (id: ${result.messageId ?? 'n/a'})`);
  } else {
    console.error(`[SMS] Failed to deliver to ${phone}: ${result.error ?? 'unknown error'}`);
  }
}
