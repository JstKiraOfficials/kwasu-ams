/**
 * @file webhook-dispatcher.service.ts
 * @module modules/webhooks
 *
 * Outbound webhook dispatcher for KWASU AMS.
 *
 * `dispatchWebhookEvent()` is the single entry point for firing webhook events.
 * It queries all active subscribers for the given event, decrypts each secret,
 * computes an HMAC-SHA256 signature, and POSTs the payload to the subscriber URL.
 *
 * Delivery is retried up to 3 times with a 5-second delay on non-2xx or timeout.
 * All delivery results (success or failure) are logged via `auditLogQueue.add()`.
 *
 * This function is always called fire-and-forget (`void dispatchWebhookEvent(...)`)
 * from integration points. Failures are logged but never propagate to the caller.
 */

import { createHmac } from 'crypto';
import { prisma } from '../../lib/prisma.js';
import { decryptTotpSecret } from '../../lib/totp.js';
import { auditLogQueue } from '../../jobs/queue.js';

// =============================================================================
// Internal constants
// =============================================================================

/** Timeout in milliseconds for each outbound webhook HTTP request. */
const FETCH_TIMEOUT_MS = 5000;

/** Maximum number of delivery attempts per webhook per event. */
const MAX_RETRIES = 3;

/** Fixed delay in milliseconds between retry attempts. */
const RETRY_DELAY_MS = 5000;

// =============================================================================
// Internal helpers
// =============================================================================

/**
 * Pauses execution for the given number of milliseconds.
 *
 * @param ms - Duration to sleep in milliseconds.
 * @returns A promise that resolves after `ms` milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Attempts a single HTTP POST to a webhook subscriber URL.
 *
 * Uses an `AbortController` to enforce a 5-second timeout. Returns `true` if
 * the response is 2xx, `false` on non-2xx or timeout/network error.
 *
 * @param url       - Subscriber endpoint URL.
 * @param payload   - JSON-serialisable event payload.
 * @param signature - Pre-computed HMAC-SHA256 hex signature string.
 * @param event     - Event name string (e.g. `'attendance.session.opened'`).
 * @returns `true` on 2xx response, `false` otherwise.
 */
async function attemptDelivery(
  url: string,
  payload: Record<string, unknown>,
  signature: string,
  event: string,
): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-KWASU-Signature': `sha256=${signature}`,
        'X-KWASU-Event': event,
      },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// =============================================================================
// dispatchWebhookEvent
// =============================================================================

/**
 * Dispatches a webhook event to all active subscribers registered for it.
 *
 * Algorithm per subscriber:
 * 1. Decrypt `secretEncrypted` to recover the plaintext secret.
 * 2. Compute `HMAC-SHA256(secret, JSON.stringify(payload))`.
 * 3. POST payload with `X-KWASU-Signature` and `X-KWASU-Event` headers.
 * 4. Retry up to 3 times with 5-second delay on failure.
 * 5. Log delivery result via `auditLogQueue.add()`.
 *
 * Always call this fire-and-forget: `void dispatchWebhookEvent(event, payload)`.
 * Errors are caught internally and never propagate.
 *
 * @param event   - Event name string (e.g. `'attendance.session.opened'`).
 * @param payload - Arbitrary JSON-serialisable data describing the event.
 * @returns A promise that resolves once all delivery attempts are complete.
 */
export async function dispatchWebhookEvent(
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  let subscribers: Array<{ id: string; url: string; secretEncrypted: string }>;

  try {
    subscribers = await prisma.webhook.findMany({
      where: {
        isActive: true,
        events: { has: event },
      },
      select: { id: true, url: true, secretEncrypted: true },
    });
  } catch {
    // DB failure — cannot dispatch; logged implicitly by the absence of audit entries
    return;
  }

  for (const webhook of subscribers) {
    let plainSecret: string;
    try {
      plainSecret = decryptTotpSecret(webhook.secretEncrypted);
    } catch {
      void auditLogQueue.add('audit', {
        actorId: 'system',
        actorRole: 'SUPER_ADMIN',
        action: 'WEBHOOK_FIRED',
        entityType: 'Webhook',
        entityId: webhook.id,
        metadata: { event, success: false, reason: 'SECRET_DECRYPT_FAILED' },
      });
      continue;
    }

    const signature = createHmac('sha256', plainSecret)
      .update(JSON.stringify(payload))
      .digest('hex');

    let success = false;
    let attempt = 0;

    while (attempt < MAX_RETRIES && !success) {
      if (attempt > 0) {
        await sleep(RETRY_DELAY_MS);
      }
      success = await attemptDelivery(webhook.url, payload, signature, event);
      attempt++;
    }

    void auditLogQueue.add('audit', {
      actorId: 'system',
      actorRole: 'SUPER_ADMIN',
      action: 'WEBHOOK_FIRED',
      entityType: 'Webhook',
      entityId: webhook.id,
      metadata: { event, success, attempts: attempt, url: webhook.url },
    });
  }
}
