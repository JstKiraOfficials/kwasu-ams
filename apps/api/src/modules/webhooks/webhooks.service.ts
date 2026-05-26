/**
 * @file webhooks.service.ts
 * @module modules/webhooks
 *
 * Business logic for webhook subscription management.
 *
 * Responsibilities:
 * - `createWebhook` — Encrypt the subscriber secret and persist the webhook record.
 *                     Returns the webhook with the plaintext secret shown once.
 * - `listWebhooks`  — List all active webhooks. Never returns `secretEncrypted`.
 * - `deleteWebhook` — Soft-delete a webhook by setting `isActive = false`.
 *
 * Webhook secrets are stored AES-256 encrypted using `encryptTotpSecret` from
 * `lib/totp.ts`. The `TOTP_ENCRYPTION_KEY` env var is reused for this purpose.
 */

import { type AuditAction, Prisma } from '@prisma/client';
import { type IWebhook } from '@kwasu-ams/types';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../middleware/error-handler.js';
import { encryptTotpSecret } from '../../lib/totp.js';
import { type CreateWebhookInput } from './webhooks.schema.js';

// =============================================================================
// Internal helpers
// =============================================================================

/**
 * Writes an immutable audit log entry. Errors are swallowed.
 *
 * @param actorId    - UUID of the user performing the action.
 * @param actorRole  - Role string of the actor.
 * @param action     - The {@link AuditAction} enum value.
 * @param entityType - Human-readable entity name.
 * @param entityId   - Optional UUID of the affected entity.
 * @param metadata   - Optional free-form context object.
 * @returns A promise that resolves once the log is written (or silently fails).
 */
async function writeAuditLog(
  actorId: string,
  actorRole: string,
  action: AuditAction,
  entityType: string,
  entityId?: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId,
        actorRole: actorRole as never,
        action,
        entityType,
        entityId: entityId ?? null,
        metadata: metadata !== undefined ? (metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    });
  } catch {
    // Fire-and-forget — audit failures must not surface to the caller
  }
}

/** Prisma `select` that returns all `IWebhook` fields (secretEncrypted omitted). */
const WEBHOOK_PUBLIC_SELECT = {
  id: true,
  url: true,
  events: true,
  isActive: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
} as const;

// =============================================================================
// createWebhook
// =============================================================================

/**
 * Creates a new webhook subscription.
 *
 * Encrypts the subscriber's plaintext secret with AES-256-CBC via
 * `encryptTotpSecret` before persisting. The plaintext secret is returned
 * exactly once in the response and never stored.
 *
 * @param data    - Validated creation payload from {@link CreateWebhookSchema}.
 * @param actorId - UUID of the `SUPER_ADMIN` creating the webhook (for audit trail).
 * @returns An object with the persisted `webhook` (no secret) and the one-time `secret`.
 */
export async function createWebhook(
  data: CreateWebhookInput,
  actorId: string,
): Promise<{ webhook: IWebhook; secret: string }> {
  const secretEncrypted = encryptTotpSecret(data.secret);

  const webhook = await prisma.webhook.create({
    data: {
      url: data.url,
      events: data.events,
      secretEncrypted,
      createdById: actorId,
    },
    select: WEBHOOK_PUBLIC_SELECT,
  });

  void writeAuditLog(actorId, 'SUPER_ADMIN', 'SYSTEM_SETTING_CHANGED', 'Webhook', webhook.id, {
    action: 'WEBHOOK_CREATED',
    url: data.url,
    events: data.events,
  });

  return { webhook: webhook as IWebhook, secret: data.secret };
}

// =============================================================================
// listWebhooks
// =============================================================================

/**
 * Returns all active webhook subscriptions.
 *
 * `secretEncrypted` is never included in the response.
 *
 * @returns Array of {@link IWebhook} records.
 */
export async function listWebhooks(): Promise<IWebhook[]> {
  const webhooks = await prisma.webhook.findMany({
    where: { isActive: true },
    select: WEBHOOK_PUBLIC_SELECT,
    orderBy: { createdAt: 'desc' },
  });

  return webhooks as IWebhook[];
}

// =============================================================================
// deleteWebhook
// =============================================================================

/**
 * Soft-deletes a webhook subscription by setting `isActive = false`.
 *
 * @param id      - UUID of the `Webhook` to deactivate.
 * @param actorId - UUID of the `SUPER_ADMIN` performing the deletion (for audit trail).
 * @returns A promise that resolves once the webhook is deactivated.
 * @throws {AppError} `NOT_FOUND` (404) — webhook does not exist or is already inactive.
 */
export async function deleteWebhook(id: string, actorId: string): Promise<void> {
  const webhook = await prisma.webhook.findFirst({
    where: { id, isActive: true },
    select: { id: true, url: true },
  });
  if (!webhook) {
    throw new AppError('NOT_FOUND', 'Webhook not found.', 404);
  }

  await prisma.webhook.update({
    where: { id },
    data: { isActive: false },
  });

  void writeAuditLog(actorId, 'SUPER_ADMIN', 'SYSTEM_SETTING_CHANGED', 'Webhook', id, {
    action: 'WEBHOOK_DELETED',
    url: webhook.url,
  });
}
