/**
 * @file sessions.routes.ts
 * @module modules/sessions
 *
 * Fastify route registrations for the sessions module.
 *
 * | Method | Path                    | Roles allowed                                         |
 * |--------|-------------------------|-------------------------------------------------------|
 * | GET    | /sessions               | SUPER_ADMIN, ACADEMIC_AFFAIRS, DEAN, HOD, LECTURER    |
 * | GET    | /sessions/:id           | Above roles + STUDENT                                 |
 * | POST   | /sessions               | SUPER_ADMIN, HOD, LECTURER                            |
 * | PATCH  | /sessions/:id/open      | SUPER_ADMIN, HOD, LECTURER                            |
 * | PATCH  | /sessions/:id/close     | SUPER_ADMIN, HOD, LECTURER                            |
 * | PATCH  | /sessions/:id/lock      | SUPER_ADMIN only                                      |
 * | GET    | /sessions/:id/live      | SUPER_ADMIN, HOD, LECTURER                            |
 * | POST   | /sessions/:id/qr        | SUPER_ADMIN, HOD, LECTURER                            |
 * | POST   | /sessions/:id/code      | SUPER_ADMIN, HOD, LECTURER                            |
 *
 * Note: static sub-paths (`/sessions/:id/open`, `/close`, `/lock`, `/live`,
 * `/qr`, `/code`) are registered before the dynamic `/:id` route to prevent
 * Fastify from matching action names as IDs.
 */

import { type FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRoles } from '../../middleware/role-guard.js';
import { Role } from '@kwasu-ams/types';
import * as controller from './sessions.controller.js';

/** Roles permitted to read session data. */
const READ_ROLES = [
  Role.SUPER_ADMIN,
  Role.ACADEMIC_AFFAIRS,
  Role.DEAN,
  Role.HOD,
  Role.LECTURER,
] as const;

/** Roles permitted to create and manage sessions. */
const MANAGE_ROLES = [Role.SUPER_ADMIN, Role.HOD, Role.LECTURER] as const;

/**
 * Registers all session routes on the provided Fastify instance.
 *
 * Called from `app.ts` via `app.register(registerSessionRoutes)`.
 *
 * @param app - The Fastify application instance to register routes on.
 * @returns A promise that resolves once all routes have been registered.
 */
export async function registerSessionRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /sessions ────────────────────────────────────────────────────────
  app.get(
    '/sessions',
    {
      preHandler: [authenticate, requireRoles(...READ_ROLES)],
      schema: {
        tags: ['sessions'],
        summary: 'List sessions (scope-aware)',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            courseSectionId: { type: 'string', format: 'uuid' },
            status: { type: 'string', enum: ['SCHEDULED', 'ACTIVE', 'CLOSED', 'LOCKED'] },
            startDate: { type: 'string', format: 'date-time' },
            endDate: { type: 'string', format: 'date-time' },
            page: { type: 'integer', minimum: 1, default: 1 },
            pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          },
        },
        response: { 200: { type: 'object' } },
      },
    },
    controller.listSessionsHandler,
  );

  // ── POST /sessions ───────────────────────────────────────────────────────
  app.post(
    '/sessions',
    {
      preHandler: [authenticate, requireRoles(...MANAGE_ROLES)],
      schema: {
        tags: ['sessions'],
        summary: 'Create a new session',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['courseSectionId', 'venueId', 'scheduledStart', 'scheduledEnd'],
          properties: {
            courseSectionId: { type: 'string', format: 'uuid' },
            venueId: { type: 'string', format: 'uuid' },
            scheduledStart: { type: 'string', format: 'date-time' },
            scheduledEnd: { type: 'string', format: 'date-time' },
            isMakeUp: { type: 'boolean', default: false },
          },
        },
        response: {
          201: { type: 'object' },
          400: { type: 'object' },
          403: { type: 'object' },
          404: { type: 'object' },
        },
      },
    },
    controller.createSessionHandler,
  );

  // ── PATCH /sessions/:id/open ─────────────────────────────────────────────
  app.patch(
    '/sessions/:id/open',
    {
      preHandler: [authenticate, requireRoles(...MANAGE_ROLES)],
      schema: {
        tags: ['sessions'],
        summary: 'Open a session (SCHEDULED → ACTIVE)',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        response: {
          200: { type: 'object' },
          400: { type: 'object' },
          403: { type: 'object' },
          404: { type: 'object' },
        },
      },
    },
    controller.openSessionHandler,
  );

  // ── PATCH /sessions/:id/close ────────────────────────────────────────────
  app.patch(
    '/sessions/:id/close',
    {
      preHandler: [authenticate, requireRoles(...MANAGE_ROLES)],
      schema: {
        tags: ['sessions'],
        summary: 'Close a session (ACTIVE → CLOSED), marks absent students',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        response: {
          200: { type: 'object' },
          400: { type: 'object' },
          403: { type: 'object' },
          404: { type: 'object' },
        },
      },
    },
    controller.closeSessionHandler,
  );

  // ── PATCH /sessions/:id/lock ─────────────────────────────────────────────
  app.patch(
    '/sessions/:id/lock',
    {
      preHandler: [authenticate, requireRoles(Role.SUPER_ADMIN)],
      schema: {
        tags: ['sessions'],
        summary: 'Lock a session (CLOSED → LOCKED) — SUPER_ADMIN only',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        response: {
          200: { type: 'object' },
          400: { type: 'object' },
          403: { type: 'object' },
          404: { type: 'object' },
        },
      },
    },
    controller.lockSessionHandler,
  );

  // ── GET /sessions/:id/live ───────────────────────────────────────────────
  app.get(
    '/sessions/:id/live',
    {
      preHandler: [authenticate, requireRoles(...MANAGE_ROLES)],
      schema: {
        tags: ['sessions'],
        summary: 'Get live check-in snapshot for a session',
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
    controller.getLiveCheckinsHandler,
  );

  // ── POST /sessions/:id/qr ────────────────────────────────────────────────
  app.post(
    '/sessions/:id/qr',
    {
      preHandler: [authenticate, requireRoles(...MANAGE_ROLES)],
      schema: {
        tags: ['sessions'],
        summary: 'Generate QR token for student check-in',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        response: { 201: { type: 'object', additionalProperties: true } },
      },
    },
    controller.generateQrTokenHandler,
  );

  // ── POST /sessions/:id/code ──────────────────────────────────────────────
  app.post(
    '/sessions/:id/code',
    {
      preHandler: [authenticate, requireRoles(...MANAGE_ROLES)],
      schema: {
        tags: ['sessions'],
        summary: 'Generate alphanumeric code for student check-in',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        response: { 201: { type: 'object', additionalProperties: true } },
      },
    },
    controller.generateSessionCodeHandler,
  );

  // ── GET /sessions/:id ────────────────────────────────────────────────────
  // Registered last to avoid matching action sub-paths as IDs
  app.get(
    '/sessions/:id',
    {
      preHandler: [authenticate, requireRoles(...READ_ROLES, Role.STUDENT)],
      schema: {
        tags: ['sessions'],
        summary: 'Get a session by ID with attendance counts',
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
    controller.getSessionByIdHandler,
  );
}
