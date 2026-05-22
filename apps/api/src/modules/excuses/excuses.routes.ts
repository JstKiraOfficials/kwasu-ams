/**
 * @file excuses.routes.ts
 * @module modules/excuses
 *
 * Fastify route registrations for the excuses module.
 *
 * | Method | Path                              | Roles                                    |
 * |--------|-----------------------------------|------------------------------------------|
 * | POST   | /excuses                          | STUDENT                                  |
 * | GET    | /excuses                          | STUDENT, LECTURER, HOD, SUPER_ADMIN      |
 * | GET    | /excuses/:id                      | STUDENT, LECTURER, HOD, SUPER_ADMIN      |
 * | PATCH  | /excuses/:id/review               | LECTURER, HOD, SUPER_ADMIN               |
 * | PATCH  | /excuses/:id/appeal               | STUDENT                                  |
 * | PATCH  | /excuses/:id/hod-review           | HOD, SUPER_ADMIN                         |
 * | GET    | /excuses/:id/documents/:key       | STUDENT, LECTURER, HOD, SUPER_ADMIN      |
 *
 * Static sub-paths (`/review`, `/appeal`, `/hod-review`, `/documents/:key`)
 * are registered before the dynamic `/:id` route to prevent Fastify from
 * matching action names as IDs.
 */

import { type FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRoles } from '../../middleware/role-guard.js';
import { Role } from '@kwasu-ams/types';
import * as controller from './excuses.controller.js';

/** Roles permitted to read excuse data. */
const READ_ROLES = [
  Role.STUDENT,
  Role.LECTURER,
  Role.HOD,
  Role.SUPER_ADMIN,
  Role.ACADEMIC_AFFAIRS,
] as const;

/** Roles permitted to review excuses (lecturer-level). */
const REVIEW_ROLES = [Role.LECTURER, Role.HOD, Role.SUPER_ADMIN] as const;

/**
 * Registers all excuse routes on the provided Fastify instance.
 *
 * Called from `app.ts` via `app.register(registerExcuseRoutes)`.
 *
 * @param app - The Fastify application instance to register routes on.
 * @returns A promise that resolves once all routes have been registered.
 */
export async function registerExcuseRoutes(app: FastifyInstance): Promise<void> {
  // ── POST /excuses ────────────────────────────────────────────────────────
  app.post(
    '/excuses',
    {
      preHandler: [authenticate, requireRoles(Role.STUDENT)],
      schema: {
        tags: ['excuses'],
        summary: 'Submit an excuse letter with optional document uploads',
        security: [{ bearerAuth: [] }],
        consumes: ['multipart/form-data'],
        response: { 201: { type: 'object', additionalProperties: true } },
      },
    },
    controller.submitExcuseHandler,
  );

  // ── GET /excuses ─────────────────────────────────────────────────────────
  app.get(
    '/excuses',
    {
      preHandler: [authenticate, requireRoles(...READ_ROLES)],
      schema: {
        tags: ['excuses'],
        summary: 'List excuse letters (scope-aware)',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: [
                'SUBMITTED',
                'UNDER_REVIEW',
                'APPROVED',
                'REJECTED',
                'APPEAL_SUBMITTED',
                'HOD_APPROVED',
                'HOD_REJECTED',
              ],
            },
            courseSectionId: { type: 'string', format: 'uuid' },
            page: { type: 'integer', minimum: 1, default: 1 },
            pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          },
        },
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    controller.listExcusesHandler,
  );

  // ── PATCH /excuses/:id/review ────────────────────────────────────────────
  app.patch(
    '/excuses/:id/review',
    {
      preHandler: [authenticate, requireRoles(...REVIEW_ROLES)],
      schema: {
        tags: ['excuses'],
        summary: 'Lecturer approves or rejects an excuse letter',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        body: {
          type: 'object',
          required: ['decision', 'comment'],
          properties: {
            decision: { type: 'string', enum: ['APPROVED', 'REJECTED'] },
            comment: { type: 'string', minLength: 5 },
          },
        },
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    controller.reviewExcuseHandler,
  );

  // ── PATCH /excuses/:id/appeal ────────────────────────────────────────────
  app.patch(
    '/excuses/:id/appeal',
    {
      preHandler: [authenticate, requireRoles(Role.STUDENT)],
      schema: {
        tags: ['excuses'],
        summary: 'Student appeals a rejected excuse letter',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        body: {
          type: 'object',
          required: ['appealReason'],
          properties: {
            appealReason: { type: 'string', minLength: 20 },
          },
        },
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    controller.appealExcuseHandler,
  );

  // ── PATCH /excuses/:id/hod-review ────────────────────────────────────────
  app.patch(
    '/excuses/:id/hod-review',
    {
      preHandler: [authenticate, requireRoles(Role.HOD, Role.SUPER_ADMIN)],
      schema: {
        tags: ['excuses'],
        summary: 'HOD makes final decision on an appealed excuse',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        body: {
          type: 'object',
          required: ['decision', 'comment'],
          properties: {
            decision: { type: 'string', enum: ['HOD_APPROVED', 'HOD_REJECTED'] },
            comment: { type: 'string', minLength: 5 },
          },
        },
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    controller.hodReviewExcuseHandler,
  );

  // ── GET /excuses/:id/documents/:key ──────────────────────────────────────
  app.get(
    '/excuses/:id/documents/:key',
    {
      preHandler: [authenticate, requireRoles(...READ_ROLES)],
      schema: {
        tags: ['excuses'],
        summary: 'Get a 15-minute pre-signed S3 URL for an excuse document',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id', 'key'],
          properties: {
            id: { type: 'string', format: 'uuid' },
            key: { type: 'string', minLength: 1 },
          },
        },
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    controller.getDocumentUrlHandler,
  );

  // ── GET /excuses/:id ─────────────────────────────────────────────────────
  // Registered last to avoid matching sub-paths as IDs
  app.get(
    '/excuses/:id',
    {
      preHandler: [authenticate, requireRoles(...READ_ROLES)],
      schema: {
        tags: ['excuses'],
        summary: 'Get a single excuse letter by ID',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    controller.getExcuseByIdHandler,
  );
}
