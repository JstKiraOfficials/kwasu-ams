/**
 * @file welfare.routes.ts
 * @module modules/welfare
 *
 * Fastify route registrations for the welfare module.
 *
 * | Method | Path                          | Roles                                    |
 * |--------|-------------------------------|------------------------------------------|
 * | GET    | /welfare                      | SUPER_ADMIN, ACADEMIC_AFFAIRS, DEAN, HOD |
 * | POST   | /welfare/check/:studentId     | SUPER_ADMIN, ACADEMIC_AFFAIRS, HOD       |
 */

import { type FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRoles } from '../../middleware/role-guard.js';
import { Role } from '@kwasu-ams/types';
import { listWelfareReferralsHandler, checkWelfareHandler } from './welfare.controller.js';

/** Roles permitted to view welfare referrals. */
const WELFARE_READ_ROLES = [Role.SUPER_ADMIN, Role.ACADEMIC_AFFAIRS, Role.DEAN, Role.HOD] as const;

/** Roles permitted to trigger welfare checks. */
const WELFARE_CHECK_ROLES = [Role.SUPER_ADMIN, Role.ACADEMIC_AFFAIRS, Role.HOD] as const;

/**
 * Registers all welfare routes on the provided Fastify instance.
 *
 * @param app - The Fastify application instance to register routes on.
 * @returns A promise that resolves once all routes have been registered.
 */
export async function registerWelfareRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /welfare ─────────────────────────────────────────────────────────
  app.get(
    '/welfare',
    {
      preHandler: [authenticate, requireRoles(...WELFARE_READ_ROLES)],
      schema: {
        tags: ['welfare'],
        summary: 'List welfare referral records',
        security: [{ bearerAuth: [] }],
        response: { 200: { type: 'array', items: { type: 'object', additionalProperties: true } } },
      },
    },
    listWelfareReferralsHandler,
  );

  // ── POST /welfare/check/:studentId ───────────────────────────────────────
  app.post(
    '/welfare/check/:studentId',
    {
      preHandler: [authenticate, requireRoles(...WELFARE_CHECK_ROLES)],
      schema: {
        tags: ['welfare'],
        summary: 'Check and trigger welfare referral for a student',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['studentId'],
          properties: { studentId: { type: 'string', format: 'uuid' } },
        },
        querystring: {
          type: 'object',
          properties: { semesterId: { type: 'string', format: 'uuid' } },
        },
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    checkWelfareHandler,
  );
}
