import { smsConfig } from '../config/sms.js';

export interface SmsResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface ISmsClient {
  sendSms(to: string, message: string): Promise<SmsResult>;
}

export class AfricasTalkingClient implements ISmsClient {
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

export class TermiiClient implements ISmsClient {
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

/** Factory — returns the correct SMS client based on the configured provider. */
export function getSmsClient(): ISmsClient {
  if (smsConfig.provider === 'termii') {
    return new TermiiClient();
  }
  return new AfricasTalkingClient();
}
