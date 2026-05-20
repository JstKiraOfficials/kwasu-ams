/**
 * @file anomalies.routes.ts
 * @module modules/anomalies
 *
 * Fastify route registrations for the anomaly flags module.
 *
 * | Method | Path                    | Roles allowed                                      |
 * |--------|-------------------------|----------------------------------------------------|
 * | GET    | /anomalies              | SUPER_ADMIN, ACADEMIC_AFFAIRS, DEAN, HOD, LECTURER |
 * | GET    | /anomalies/:id          | Same roles                                         |
 * | PATCH  | /anomalies/:id/review   | Same roles                                         |
 */

import { type FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRoles } from '../../middleware/role-guard.js';
import { Role } from '@kwasu-ams/types';
import * as controller from './anomalies.controller.js';

/** Roles permitted to view and review anomaly flags. */
const ANOMALY_ROLES = [
  Role.SUPER_ADMIN,
  Role.ACADEMIC_AFFAIRS,
  Role.DEAN,
  Role.HOD,
  Role.LECTURER,
] as const;

/**
 * Registers all anomaly flag routes on the provided Fastify instance.
 *
 * Called from `app.ts` via `app.register(registerAnomalyRoutes)`.
 *
 * @param app - The Fastify application instance to register routes on.
 * @returns A promise that resolves once all routes have been registered.
 */
export async function registerAnomalyRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /anomalies ───────────────────────────────────────────────────────
  app.get(
    '/anomalies',
    {
      preHandler: [authenticate, requireRoles(...ANOMALY_ROLES)],
      schema: {
        tags: ['anomalies'],
        summary: 'List anomaly flags (scope-aware)',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', format: 'uuid' },
            studentId: { type: 'string', format: 'uuid' },
            flagType: { type: 'string' },
            isReviewed: { type: 'boolean' },
            page: { type: 'integer', minimum: 1, default: 1 },
            pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          },
        },
        response: { 200: { type: 'object' } },
      },
    },
    controller.listAnomalyFlagsHandler,
  );

  // ── GET /anomalies/:id ───────────────────────────────────────────────────
  app.get(
    '/anomalies/:id',
    {
      preHandler: [authenticate, requireRoles(...ANOMALY_ROLES)],
      schema: {
        tags: ['anomalies'],
        summary: 'Get an anomaly flag by ID',
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
    controller.getAnomalyFlagByIdHandler,
  );

  // ── PATCH /anomalies/:id/review ──────────────────────────────────────────
  app.patch(
    '/anomalies/:id/review',
    {
      preHandler: [authenticate, requireRoles(...ANOMALY_ROLES)],
      schema: {
        tags: ['anomalies'],
        summary: 'Review an anomaly flag',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        body: {
          type: 'object',
          required: ['action', 'note'],
          properties: {
            action: {
              type: 'string',
              enum: ['CONFIRMED_PRESENT', 'CONFIRMED_ABSENT', 'ESCALATED'],
            },
            note: { type: 'string', minLength: 5 },
          },
        },
        response: {
          200: { type: 'object' },
          400: { type: 'object' },
          403: { type: 'object' },
          404: { type: 'object' },
          409: { type: 'object' },
        },
      },
    },
    controller.reviewAnomalyFlagHandler,
  );
}
