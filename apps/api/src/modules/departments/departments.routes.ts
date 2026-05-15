/**
 * @file departments.routes.ts
 * @module modules/departments
 *
 * Fastify route registrations for the departments module.
 *
 * | Method | Path               | Roles allowed                                    |
 * |--------|--------------------|--------------------------------------------------|
 * | GET    | /departments       | All authenticated roles (SUPER_ADMIN … LECTURER) |
 * | GET    | /departments/:id   | All authenticated roles                          |
 * | POST   | /departments       | SUPER_ADMIN, ACADEMIC_AFFAIRS                    |
 * | PATCH  | /departments/:id   | SUPER_ADMIN, ACADEMIC_AFFAIRS                    |
 * | DELETE | /departments/:id   | SUPER_ADMIN only                                 |
 */

import { type FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRoles } from '../../middleware/role-guard.js';
import { Role } from '@kwasu-ams/types';
import * as controller from './departments.controller.js';

/** Roles permitted to read department data. */
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
 * Registers all department routes on the provided Fastify instance.
 *
 * Called from `app.ts` via `app.register(registerDepartmentRoutes)`.
 *
 * @param app - The Fastify application instance to register routes on.
 * @returns A promise that resolves once all routes have been registered.
 */
export async function registerDepartmentRoutes(app: FastifyInstance): Promise<void> {
  // GET /departments
  app.get(
    '/departments',
    {
      preHandler: [authenticate, requireRoles(...READ_ROLES)],
      schema: {
        tags: ['departments'],
        summary: 'List departments (scope-aware)',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            facultyId: { type: 'string', format: 'uuid' },
            page: { type: 'integer', minimum: 1, default: 1 },
            pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          },
        },
        response: { 200: { type: 'object' } },
      },
    },
    controller.listDepartmentsHandler,
  );

  // GET /departments/:id
  app.get(
    '/departments/:id',
    {
      preHandler: [authenticate, requireRoles(...READ_ROLES)],
      schema: {
        tags: ['departments'],
        summary: 'Get a department by ID',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        response: { 200: { type: 'object' }, 403: { type: 'object' }, 404: { type: 'object' } },
      },
    },
    controller.getDepartmentByIdHandler,
  );

  // POST /departments
  app.post(
    '/departments',
    {
      preHandler: [authenticate, requireRoles(Role.SUPER_ADMIN, Role.ACADEMIC_AFFAIRS)],
      schema: {
        tags: ['departments'],
        summary: 'Create a new department',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['name', 'code', 'facultyId'],
          properties: {
            name: { type: 'string', minLength: 2 },
            code: { type: 'string', minLength: 2, maxLength: 10 },
            facultyId: { type: 'string', format: 'uuid' },
          },
        },
        response: { 201: { type: 'object' } },
      },
    },
    controller.createDepartmentHandler,
  );

  // PATCH /departments/:id
  app.patch(
    '/departments/:id',
    {
      preHandler: [authenticate, requireRoles(Role.SUPER_ADMIN, Role.ACADEMIC_AFFAIRS)],
      schema: {
        tags: ['departments'],
        summary: 'Update a department',
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
    controller.updateDepartmentHandler,
  );

  // DELETE /departments/:id
  app.delete(
    '/departments/:id',
    {
      preHandler: [authenticate, requireRoles(Role.SUPER_ADMIN)],
      schema: {
        tags: ['departments'],
        summary: 'Delete a department',
        description: 'Hard-deletes a department. Fails with 409 if programmes or courses exist.',
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
    controller.deleteDepartmentHandler,
  );
}
