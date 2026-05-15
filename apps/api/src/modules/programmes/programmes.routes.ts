/**
 * @file programmes.routes.ts
 * @module modules/programmes
 *
 * Fastify route registrations for the programmes module.
 *
 * | Method | Path              | Roles allowed                                       |
 * |--------|-------------------|-----------------------------------------------------|
 * | GET    | /programmes       | All authenticated roles (SUPER_ADMIN … STUDENT)     |
 * | GET    | /programmes/:id   | All authenticated roles                             |
 * | POST   | /programmes       | SUPER_ADMIN, ACADEMIC_AFFAIRS                       |
 * | PATCH  | /programmes/:id   | SUPER_ADMIN, ACADEMIC_AFFAIRS                       |
 * | DELETE | /programmes/:id   | SUPER_ADMIN only                                    |
 */

import { type FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRoles } from '../../middleware/role-guard.js';
import { Role } from '@kwasu-ams/types';
import * as controller from './programmes.controller.js';

/** Roles permitted to read programme data (includes STUDENT). */
const READ_ROLES = [
  Role.SUPER_ADMIN,
  Role.ACADEMIC_AFFAIRS,
  Role.VICE_CHANCELLOR,
  Role.DEAN,
  Role.HOD,
  Role.EXAM_OFFICER,
  Role.LECTURER,
  Role.STUDENT,
] as const;

/**
 * Registers all programme routes on the provided Fastify instance.
 *
 * Called from `app.ts` via `app.register(registerProgrammeRoutes)`.
 *
 * @param app - The Fastify application instance to register routes on.
 * @returns A promise that resolves once all routes have been registered.
 */
export async function registerProgrammeRoutes(app: FastifyInstance): Promise<void> {
  // GET /programmes
  app.get(
    '/programmes',
    {
      preHandler: [authenticate, requireRoles(...READ_ROLES)],
      schema: {
        tags: ['programmes'],
        summary: 'List programmes (scope-aware)',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            departmentId: { type: 'string', format: 'uuid' },
            page: { type: 'integer', minimum: 1, default: 1 },
            pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          },
        },
        response: { 200: { type: 'object' } },
      },
    },
    controller.listProgrammesHandler,
  );

  // GET /programmes/:id
  app.get(
    '/programmes/:id',
    {
      preHandler: [authenticate, requireRoles(...READ_ROLES)],
      schema: {
        tags: ['programmes'],
        summary: 'Get a programme by ID',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        response: { 200: { type: 'object' }, 404: { type: 'object' } },
      },
    },
    controller.getProgrammeByIdHandler,
  );

  // POST /programmes
  app.post(
    '/programmes',
    {
      preHandler: [authenticate, requireRoles(Role.SUPER_ADMIN, Role.ACADEMIC_AFFAIRS)],
      schema: {
        tags: ['programmes'],
        summary: 'Create a new programme',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['name', 'code', 'departmentId', 'durationYears'],
          properties: {
            name: { type: 'string', minLength: 2 },
            code: { type: 'string', minLength: 2, maxLength: 20 },
            departmentId: { type: 'string', format: 'uuid' },
            durationYears: { type: 'integer', minimum: 1, maximum: 7 },
          },
        },
        response: { 201: { type: 'object' } },
      },
    },
    controller.createProgrammeHandler,
  );

  // PATCH /programmes/:id
  app.patch(
    '/programmes/:id',
    {
      preHandler: [authenticate, requireRoles(Role.SUPER_ADMIN, Role.ACADEMIC_AFFAIRS)],
      schema: {
        tags: ['programmes'],
        summary: 'Update a programme',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        body: {
          type: 'object',
          properties: {
            name: { type: 'string', minLength: 2 },
            code: { type: 'string', minLength: 2, maxLength: 20 },
            durationYears: { type: 'integer', minimum: 1, maximum: 7 },
          },
        },
        response: { 200: { type: 'object' }, 404: { type: 'object' } },
      },
    },
    controller.updateProgrammeHandler,
  );

  // DELETE /programmes/:id
  app.delete(
    '/programmes/:id',
    {
      preHandler: [authenticate, requireRoles(Role.SUPER_ADMIN)],
      schema: {
        tags: ['programmes'],
        summary: 'Delete a programme',
        description: 'Hard-deletes a programme. Fails with 409 if students are enrolled.',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        response: {
          200: { type: 'object', properties: { message: { type: 'string' } } },
          404: { type: 'object' },
          409: { type: 'object' },
        },
      },
    },
    controller.deleteProgrammeHandler,
  );
}
