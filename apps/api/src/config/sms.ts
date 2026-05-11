import { env } from './env.js';

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
