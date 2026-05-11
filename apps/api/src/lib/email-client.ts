import { env } from '../config/env.js';

/**
 * Placeholder email client — implemented in Phase 25.
 * In development, logs the email to console.
 * In production, throws until Phase 25 wires up the real implementation.
 */
export async function sendEmail(to: string, subject: string, htmlBody: string): Promise<void> {
  if (env.NODE_ENV !== 'production') {
    console.info(`[Email stub] To: ${to} | Subject: ${subject}\n${htmlBody}`);
    return;
  }
  throw new Error('Email client not configured. Implement in Phase 25.');
}
