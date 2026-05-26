/**
 * @file webhooks.routes.ts
 * @module modules/webhooks
 *
 * Fastify route registrations for the webhooks module.
 *
 * | Method | Path           | Roles allowed |
 * |--------|----------------|---------------|
 * | GET    | /webhooks      | SUPER_ADMIN   |
 * | POST   | /webhooks      | SUPER_ADMIN   |
 * | DELETE | /webhooks/:id  | SUPER_ADMIN   |
 *
 * All endpoints require `authenticate → requireRoles(SUPER_ADMIN)`.
 */

import { type FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRoles } from '../../middleware/role-guard.js';
import { Role } from '@kwasu-ams/types';
import * as controller from './webhooks.controller.js';
import { WEBHOOK_EVENTS } from './webhooks.schema.js';

/**
 * Registers all webhook routes on the provided Fastify instance.
 *
 * Called from `app.ts` via `app.register(registerWebhookRoutes)`.
 *
 * @param app - The Fastify application instance to register routes on.
 * @returns A promise that resolves once all routes have been registered.
 */
export async function registerWebhookRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /webhooks ────────────────────────────────────────────────────────
  app.get(
    '/webhooks',
    {
      preHandler: [authenticate, requireRoles(Role.SUPER_ADMIN)],
      schema: {
        tags: ['webhooks'],
        summary: 'List all active webhook subscriptions — SUPER_ADMIN only',
        security: [{ bearerAuth: [] }],
        response: {
          200: { type: 'array', items: { type: 'object', additionalProperties: true } },
          403: { type: 'object' },
        },
      },
    },
    controller.listWebhooksHandler,
  );

  // ── POST /webhooks ───────────────────────────────────────────────────────
  app.post(
    '/webhooks',
    {
      preHandler: [authenticate, requireRoles(Role.SUPER_ADMIN)],
      schema: {
        tags: ['webhooks'],
        summary: 'Create a webhook subscription — SUPER_ADMIN only',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['url', 'events', 'secret'],
          properties: {
            url: { type: 'string', format: 'uri' },
            events: {
              type: 'array',
              items: { type: 'string', enum: WEBHOOK_EVENTS },
              minItems: 1,
            },
            secret: { type: 'string', minLength: 16 },
          },
        },
        response: {
          201: { type: 'object', additionalProperties: true },
          400: { type: 'object' },
          403: { type: 'object' },
        },
      },
    },
    controller.createWebhookHandler,
  );

  // ── DELETE /webhooks/:id ─────────────────────────────────────────────────
  app.delete(
    '/webhooks/:id',
    {
      preHandler: [authenticate, requireRoles(Role.SUPER_ADMIN)],
      schema: {
        tags: ['webhooks'],
        summary: 'Delete (soft-deactivate) a webhook subscription — SUPER_ADMIN only',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        response: {
          200: { type: 'object' },
          403: { type: 'object' },
          404: { type: 'object' },
        },
      },
    },
    controller.deleteWebhookHandler,
  );
}
