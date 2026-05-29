/**
 * @file eligibility.routes.ts
 * @module modules/eligibility
 *
 * Fastify route registrations for the eligibility module.
 *
 * | Method | Path                                  | Roles                                          |
 * |--------|---------------------------------------|------------------------------------------------|
 * | POST   | /eligibility/compute                  | SUPER_ADMIN, ACADEMIC_AFFAIRS                  |
 * | GET    | /eligibility/at-risk                  | SUPER_ADMIN, ACADEMIC_AFFAIRS, DEAN, HOD       |
 * | GET    | /eligibility/student/:studentId       | SUPER_ADMIN…STUDENT                            |
 * | GET    | /eligibility/course/:courseSectionId  | SUPER_ADMIN…EXAM_OFFICER                       |
 * | POST   | /eligibility/freeze/:semesterId       | SUPER_ADMIN                                    |
 * | PATCH  | /eligibility/:id/override             | DEAN, SUPER_ADMIN                              |
 * | POST   | /eligibility/:id/appeal               | STUDENT                                        |
 * | PATCH  | /eligibility/:id/appeal/decide        | LECTURER, HOD, DEAN, SUPER_ADMIN               |
 *
 * Static sub-paths (`/compute`, `/at-risk`, `/freeze/:semesterId`,
 * `/student/:studentId`, `/course/:courseSectionId`) are registered before the
 * dynamic `/:id` routes.
 */

import { type FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRoles } from '../../middleware/role-guard.js';
import { Role } from '@kwasu-ams/types';
import * as controller from './eligibility.controller.js';

/** Roles permitted to read eligibility data. */
const READ_ROLES = [
  Role.SUPER_ADMIN,
  Role.ACADEMIC_AFFAIRS,
  Role.DEAN,
  Role.HOD,
  Role.EXAM_OFFICER,
  Role.LECTURER,
  Role.STUDENT,
] as const;

/** Roles permitted to view at-risk student reports. */
const AT_RISK_ROLES = [Role.SUPER_ADMIN, Role.ACADEMIC_AFFAIRS, Role.DEAN, Role.HOD] as const;

/** Roles permitted to decide appeals. */
const APPEAL_DECIDE_ROLES = [Role.LECTURER, Role.HOD, Role.DEAN, Role.SUPER_ADMIN] as const;

/**
 * Registers all eligibility routes on the provided Fastify instance.
 *
 * Called from `app.ts` via `app.register(registerEligibilityRoutes)`.
 *
 * @param app - The Fastify application instance to register routes on.
 * @returns A promise that resolves once all routes have been registered.
 */
export async function registerEligibilityRoutes(app: FastifyInstance): Promise<void> {
  // ── POST /eligibility/compute ────────────────────────────────────────────
  app.post(
    '/eligibility/compute',
    {
      preHandler: [authenticate, requireRoles(Role.SUPER_ADMIN, Role.ACADEMIC_AFFAIRS)],
      schema: {
        tags: ['eligibility'],
        summary: 'Trigger eligibility computation for a semester',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['semesterId'],
          properties: { semesterId: { type: 'string', format: 'uuid' } },
        },
        response: { 202: { type: 'object', additionalProperties: true } },
      },
    },
    controller.triggerComputationHandler,
  );

  // ── GET /eligibility/at-risk ─────────────────────────────────────────────
  app.get(
    '/eligibility/at-risk',
    {
      preHandler: [authenticate, requireRoles(...AT_RISK_ROLES)],
      schema: {
        tags: ['eligibility'],
        summary: 'List at-risk students (atRiskPredicted=true) for the active semester',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            semesterId: { type: 'string', format: 'uuid' },
            page: { type: 'integer', minimum: 1, default: 1 },
            pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          },
        },
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    controller.getAtRiskHandler,
  );

  // ── GET /eligibility/student/:studentId ──────────────────────────────────
  app.get(
    '/eligibility/student/:studentId',
    {
      preHandler: [authenticate, requireRoles(...READ_ROLES)],
      schema: {
        tags: ['eligibility'],
        summary: 'Get eligibility records for a student',
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
        response: { 200: { type: 'array', items: { type: 'object', additionalProperties: true } } },
      },
    },
    controller.getStudentEligibilityHandler,
  );

  // ── GET /eligibility/course/:courseSectionId ─────────────────────────────
  app.get(
    '/eligibility/course/:courseSectionId',
    {
      preHandler: [authenticate, requireRoles(...READ_ROLES)],
      schema: {
        tags: ['eligibility'],
        summary: 'Get eligibility records for a course section (paginated)',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['courseSectionId'],
          properties: { courseSectionId: { type: 'string', format: 'uuid' } },
        },
        querystring: {
          type: 'object',
          properties: {
            semesterId: { type: 'string', format: 'uuid' },
            page: { type: 'integer', minimum: 1, default: 1 },
            pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          },
        },
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    controller.getCourseEligibilityHandler,
  );

  // ── POST /eligibility/freeze/:semesterId ─────────────────────────────────
  app.post(
    '/eligibility/freeze/:semesterId',
    {
      preHandler: [authenticate, requireRoles(Role.SUPER_ADMIN)],
      schema: {
        tags: ['eligibility'],
        summary: 'Freeze eligibility for a semester — SUPER_ADMIN only',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['semesterId'],
          properties: { semesterId: { type: 'string', format: 'uuid' } },
        },
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    controller.freezeEligibilityHandler,
  );

  // ── PATCH /eligibility/:id/override ─────────────────────────────────────
  app.patch(
    '/eligibility/:id/override',
    {
      preHandler: [authenticate, requireRoles(Role.DEAN, Role.SUPER_ADMIN)],
      schema: {
        tags: ['eligibility'],
        summary: 'Override eligibility status — DEAN/SUPER_ADMIN only',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        body: {
          type: 'object',
          required: ['status', 'reason'],
          properties: {
            status: {
              type: 'string',
              enum: ['PENDING', 'ELIGIBLE', 'BARRED', 'CONDITIONAL'],
            },
            reason: { type: 'string', minLength: 10 },
          },
        },
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    controller.overrideEligibilityHandler,
  );

  // ── POST /eligibility/:id/appeal ─────────────────────────────────────────
  app.post(
    '/eligibility/:id/appeal',
    {
      preHandler: [authenticate, requireRoles(Role.STUDENT)],
      schema: {
        tags: ['eligibility'],
        summary: 'Student submits an appeal for a BARRED eligibility record',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        body: {
          type: 'object',
          required: ['reason'],
          properties: { reason: { type: 'string', minLength: 20 } },
        },
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    controller.submitAppealHandler,
  );

  // ── PATCH /eligibility/:id/appeal/decide ─────────────────────────────────
  app.patch(
    '/eligibility/:id/appeal/decide',
    {
      preHandler: [authenticate, requireRoles(...APPEAL_DECIDE_ROLES)],
      schema: {
        tags: ['eligibility'],
        summary: 'Decide an eligibility appeal',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        body: {
          type: 'object',
          required: ['decision', 'reason'],
          properties: {
            decision: { type: 'string', enum: ['APPROVED', 'REJECTED'] },
            reason: { type: 'string', minLength: 10 },
          },
        },
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    controller.decideAppealHandler,
  );
}
