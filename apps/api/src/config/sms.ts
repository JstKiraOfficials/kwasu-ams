/**
 * @file sms.ts
 * @module config
 *
 * SMS gateway configuration derived from validated environment variables.
 * Supports AfricasTalking and Termii providers. The active provider is selected
 * by `SMS_PROVIDER`. Consumed by `lib/sms-client.ts`.
 */

import { env } from './env.js';

/**
 * SMS gateway settings read from the validated environment.
 * `provider` determines which concrete {@link ISmsClient} implementation is used.
 */
export const smsConfig = {
  provider: env.SMS_PROVIDER,
  africastalking: {
    apiKey: env.AFRICASTALKING_API_KEY ?? '',
    username: env.AFRICASTALKING_USERNAME ?? '',
  },
  termii: {
    apiKey: env.TERMII_API_KEY ?? '',
  },
  senderId: env.SMS_SENDER_ID,
} as const;
