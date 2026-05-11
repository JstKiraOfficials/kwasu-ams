/**
 * @file sms-client.ts
 * @module lib
 *
 * SMS gateway adapter for KWASU AMS.
 *
 * Implements the adapter pattern with a common {@link ISmsClient} interface and
 * two concrete implementations:
 * - {@link AfricasTalkingClient} — default provider for Nigerian SMS delivery
 * - {@link TermiiClient} — alternative provider
 *
 * The active implementation is selected at runtime by {@link getSmsClient} based
 * on the `SMS_PROVIDER` environment variable.
 *
 * Phase 25 note: The notification service will call `getSmsClient().sendSms()`
 * to deliver temporary passwords and attendance alerts.
 */

import { smsConfig } from '../config/sms.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Result returned by every {@link ISmsClient.sendSms} call.
 * `success: true` guarantees the message was accepted by the gateway.
 * `success: false` includes an `error` string describing the failure.
 */
export interface SmsResult {
  /** Whether the gateway accepted the message. */
  success: boolean;
  /** Gateway-assigned message ID (present on success). */
  messageId?: string;
  /** Human-readable error description (present on failure). */
  error?: string;
}

/**
 * Common interface for all SMS provider implementations.
 * Allows the notification service to be provider-agnostic.
 */
export interface ISmsClient {
  /**
   * Sends an SMS message to the specified phone number.
   *
   * @param to      - Recipient phone number in E.164 format (e.g. `+2348012345678`).
   * @param message - Plaintext message body (max 160 chars for single SMS).
   * @returns A {@link SmsResult} indicating success or failure.
   */
  sendSms(to: string, message: string): Promise<SmsResult>;
}

// =============================================================================
// AfricasTalking implementation
// =============================================================================

/**
 * SMS client implementation using the AfricasTalking gateway.
 *
 * Default provider for Nigerian SMS delivery. Requires `AFRICASTALKING_API_KEY`
 * and `AFRICASTALKING_USERNAME` environment variables.
 */
export class AfricasTalkingClient implements ISmsClient {
  /**
   * Sends an SMS via the AfricasTalking REST API.
   *
   * @param to      - Recipient phone number in E.164 format.
   * @param message - Plaintext message body.
   * @returns A {@link SmsResult} with the gateway message ID on success.
   */
  async sendSms(to: string, message: string): Promise<SmsResult> {
    try {
      const response = await fetch('https://api.africastalking.com/version1/messaging', {
        method: 'POST',
        headers: {
          apiKey: smsConfig.africastalking.apiKey,
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          username: smsConfig.africastalking.username,
          to,
          message,
          from: smsConfig.senderId,
        }),
      });

      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}` };
      }

      const data = (await response.json()) as {
        SMSMessageData?: { Recipients?: Array<{ messageId: string }> };
      };
      const messageId = data.SMSMessageData?.Recipients?.[0]?.messageId;
      return { success: true, ...(messageId !== undefined ? { messageId } : {}) };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  }
}

// =============================================================================
// Termii implementation
// =============================================================================

/**
 * SMS client implementation using the Termii gateway.
 *
 * Alternative provider. Requires `TERMII_API_KEY` environment variable.
 */
export class TermiiClient implements ISmsClient {
  /**
   * Sends an SMS via the Termii REST API.
   *
   * @param to      - Recipient phone number in E.164 format.
   * @param message - Plaintext message body.
   * @returns A {@link SmsResult} with the gateway message ID on success.
   */
  async sendSms(to: string, message: string): Promise<SmsResult> {
    try {
      const response = await fetch('https://api.ng.termii.com/api/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: smsConfig.termii.apiKey,
          to,
          from: smsConfig.senderId,
          sms: message,
          type: 'plain',
          channel: 'generic',
        }),
      });

      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}` };
      }

      const data = (await response.json()) as { message_id?: string };
      return {
        success: true,
        ...(data.message_id !== undefined ? { messageId: data.message_id } : {}),
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  }
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Returns the correct {@link ISmsClient} implementation based on the configured
 * `SMS_PROVIDER` environment variable.
 *
 * @returns An {@link AfricasTalkingClient} or {@link TermiiClient} instance.
 */
export function getSmsClient(): ISmsClient {
  if (smsConfig.provider === 'termii') {
    return new TermiiClient();
  }
  return new AfricasTalkingClient();
}
