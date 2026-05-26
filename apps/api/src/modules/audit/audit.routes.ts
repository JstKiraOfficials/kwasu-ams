/**
 * @file audit.routes.ts
 * @module modules/audit
 *
 * Fastify route registrations for the audit log module.
 *
 * | Method | Path            | Roles       | Description                    |
 * |--------|-----------------|-------------|--------------------------------|
 * | GET    | /audit-logs     | SUPER_ADMIN | Paginated, filtered audit logs |
 * | GET    | /audit-logs/:id | SUPER_ADMIN | Single audit log entry         |
 *
 * The audit log is append-only — no write endpoints are exposed.
 */

import { type FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRoles } from '../../middleware/role-guard.js';
import { Role } from '@kwasu-ams/types';
import { listAuditLogsHandler, getAuditLogByIdHandler } from './audit.controller.js';

/**
 * Registers all audit log routes on the provided Fastify instance.
 *
 * @param app - The Fastify application instance to register routes on.
 * @returns A promise that resolves once all routes have been registered.
 */
export async function registerAuditRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /audit-logs ──────────────────────────────────────────────────────
  app.get(
    '/audit-logs',
    {
      preHandler: [authenticate, requireRoles(Role.SUPER_ADMIN)],
      schema: {
        tags: ['audit'],
        summary: 'List audit logs (SUPER_ADMIN only)',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            actorId: { type: 'string', format: 'uuid' },
            action: { type: 'string' },
            entityType: { type: 'string' },
            entityId: { type: 'string', format: 'uuid' },
            startDate: { type: 'string', format: 'date-time' },
            endDate: { type: 'string', format: 'date-time' },
            page: { type: 'integer', minimum: 1, default: 1 },
            pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          },
        },
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    listAuditLogsHandler,
  );

  // ── GET /audit-logs/:id ──────────────────────────────────────────────────
  app.get(
    '/audit-logs/:id',
    {
      preHandler: [authenticate, requireRoles(Role.SUPER_ADMIN)],
      schema: {
        tags: ['audit'],
        summary: 'Get a single audit log entry by ID (SUPER_ADMIN only)',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    getAuditLogByIdHandler,
  );
}
