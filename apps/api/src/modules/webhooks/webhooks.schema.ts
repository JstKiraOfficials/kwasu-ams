/**
 * @file webhooks.schema.ts
 * @module modules/webhooks
 *
 * Zod validation schemas for the webhooks module.
 */

import { z } from 'zod';

/** All event names that can be subscribed to via a webhook. */
export const WEBHOOK_EVENTS = [
  'attendance.session.opened',
  'attendance.session.closed',
  'attendance.checkin.recorded',
  'student.eligibility.barred',
  'student.eligibility.confirmed',
  'excuse.approved',
  'excuse.rejected',
] as const;

/**
 * Schema for creating a new webhook subscription.
 *
 * - `url`    — A valid HTTPS URL for the subscriber endpoint.
 * - `events` — At least one event name from the allowed set.
 * - `secret` — Plaintext secret (min 16 chars) used to sign payloads via HMAC-SHA256.
 *              Stored AES-256 encrypted; shown to the subscriber exactly once.
 */
export const CreateWebhookSchema = z.object({
  url: z.string().url('url must be a valid URL'),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1, 'events must contain at least one event'),
  secret: z.string().min(16, 'secret must be at least 16 characters'),
});

/** TypeScript type inferred from {@link CreateWebhookSchema}. */
export type CreateWebhookInput = z.infer<typeof CreateWebhookSchema>;
