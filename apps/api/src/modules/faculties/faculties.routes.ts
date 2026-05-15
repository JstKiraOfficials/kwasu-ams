/**
 * @file faculties.routes.ts
 * @module modules/faculties
 *
 * Fastify route registrations for the faculties module.
 *
 * | Method | Path            | Roles allowed                                      |
 * |--------|-----------------|----------------------------------------------------|
 * | GET    | /faculties      | All authenticated roles (SUPER_ADMIN … LECTURER)   |
 * | GET    | /faculties/:id  | All authenticated roles                            |
 * | POST   | /faculties      | SUPER_ADMIN, ACADEMIC_AFFAIRS                      |
 * | PATCH  | /faculties/:id  | SUPER_ADMIN, ACADEMIC_AFFAIRS                      |
 * | DELETE | /faculties/:id  | SUPER_ADMIN only                                   |
 */

import { type FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRoles } from '../../middleware/role-guard.js';
import { Role } from '@kwasu-ams/types';
import * as controller from './faculties.controller.js';

/** Roles permitted to read faculty data. */
const READ_ROLES = [
  Role.SUPER_ADMIN,
  Role.ACADEMIC_AFFAIRS,
  Role.VICE_CHANCELLOR,
  Role.DEAN,
  Role.HOD,
  Role.EXAM_OFFICER,
  Role.LECTURER,
] as const;

/**
 * Registers all faculty routes on the provided Fastify instance.
 *
 * Called from `app.ts` via `app.register(registerFacultyRoutes)`.
 *
 * @param app - The Fastify application instance to register routes on.
 * @returns A promise that resolves once all routes have been registered.
 */
export async function registerFacultyRoutes(app: FastifyInstance): Promise<void> {
  // GET /faculties
  app.get(
    '/faculties',
    {
      preHandler: [authenticate, requireRoles(...READ_ROLES)],
      schema: {
        tags: ['faculties'],
        summary: 'List all faculties',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'integer', minimum: 1, default: 1 },
            pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          },
        },
        response: { 200: { type: 'object' } },
      },
    },
    controller.listFacultiesHandler,
  );

  // GET /faculties/:id
  app.get(
    '/faculties/:id',
    {
      preHandler: [authenticate, requireRoles(...READ_ROLES)],
      schema: {
        tags: ['faculties'],
        summary: 'Get a faculty by ID',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        response: { 200: { type: 'object' }, 404: { type: 'object' } },
      },
    },
    controller.getFacultyByIdHandler,
  );

  // POST /faculties
  app.post(
    '/faculties',
    {
      preHandler: [authenticate, requireRoles(Role.SUPER_ADMIN, Role.ACADEMIC_AFFAIRS)],
      schema: {
        tags: ['faculties'],
        summary: 'Create a new faculty',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['name', 'code', 'universityId'],
          properties: {
            name: { type: 'string', minLength: 2 },
            code: { type: 'string', minLength: 2, maxLength: 10 },
            universityId: { type: 'string', format: 'uuid' },
          },
        },
        response: { 201: { type: 'object' } },
      },
    },
    controller.createFacultyHandler,
  );

  // PATCH /faculties/:id
  app.patch(
    '/faculties/:id',
    {
      preHandler: [authenticate, requireRoles(Role.SUPER_ADMIN, Role.ACADEMIC_AFFAIRS)],
      schema: {
        tags: ['faculties'],
        summary: 'Update a faculty',
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
            code: { type: 'string', minLength: 2, maxLength: 10 },
          },
        },
        response: { 200: { type: 'object' }, 404: { type: 'object' } },
      },
    },
    controller.updateFacultyHandler,
  );

  // DELETE /faculties/:id
  app.delete(
    '/faculties/:id',
    {
      preHandler: [authenticate, requireRoles(Role.SUPER_ADMIN)],
      schema: {
        tags: ['faculties'],
        summary: 'Delete a faculty',
        description: 'Hard-deletes a faculty. Fails with 409 if departments exist.',
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
    controller.deleteFacultyHandler,
  );
}
