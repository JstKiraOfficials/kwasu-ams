/**
 * @file admin.routes.ts
 * @module modules/admin
 *
 * Fastify route registrations for the admin user management module.
 *
 * All routes require authentication and are restricted to privileged roles.
 * Guard chain on every route: `authenticate → requireRoles(...)`.
 *
 * | Method | Path                        | Roles allowed                        |
 * |--------|-----------------------------|--------------------------------------|
 * | GET    | /admin/users                | SUPER_ADMIN, ACADEMIC_AFFAIRS        |
 * | GET    | /admin/users/:id            | SUPER_ADMIN, ACADEMIC_AFFAIRS        |
 * | POST   | /admin/users                | SUPER_ADMIN, ACADEMIC_AFFAIRS        |
 * | PATCH  | /admin/users/:id            | SUPER_ADMIN, ACADEMIC_AFFAIRS        |
 * | DELETE | /admin/users/:id            | SUPER_ADMIN only                     |
 * | POST   | /admin/users/import         | SUPER_ADMIN only                     |
 * | POST   | /admin/users/:id/reset-totp | SUPER_ADMIN only                     |
 */

import { type FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRoles } from '../../middleware/role-guard.js';
import { Role } from '@kwasu-ams/types';
import * as controller from './admin.controller.js';
import {
  listAcademicSessionsHandler,
  createAcademicSessionHandler,
  activateAcademicSessionHandler,
  createSemesterHandler,
  activateSemesterHandler,
  freezeSemesterHandler,
} from './admin.controller.js';

/**
 * Registers all admin user management routes on the provided Fastify instance.
 *
 * Called from `app.ts` via `app.register(registerAdminRoutes)`.
 *
 * @param app - The Fastify application instance to register routes on.
 * @returns A promise that resolves once all routes have been registered.
 */
export async function registerAdminRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /admin/users ──────────────────────────────────────────────────────
  app.get(
    '/admin/users',
    {
      preHandler: [authenticate, requireRoles(Role.SUPER_ADMIN, Role.ACADEMIC_AFFAIRS)],
      schema: {
        tags: ['admin'],
        summary: 'List users with pagination and filters',
        description:
          'Returns a paginated list of active users. Supports filtering by role, ' +
          'active status, and a search term matched against fullName and identifier. ' +
          'ACADEMIC_AFFAIRS actors are restricted to users within their scopeId.',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'integer', minimum: 1, default: 1 },
            pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            role: { type: 'string', enum: Object.values(Role) },
            departmentId: { type: 'string', format: 'uuid' },
            isActive: { type: 'boolean' },
            search: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              data: { type: 'array', items: { type: 'object' } },
              meta: {
                type: 'object',
                properties: {
                  page: { type: 'integer' },
                  pageSize: { type: 'integer' },
                  total: { type: 'integer' },
                  totalPages: { type: 'integer' },
                },
              },
            },
          },
        },
      },
    },
    controller.listUsersHandler,
  );

  // ── GET /admin/users/:id ──────────────────────────────────────────────────
  app.get(
    '/admin/users/:id',
    {
      preHandler: [authenticate, requireRoles(Role.SUPER_ADMIN, Role.ACADEMIC_AFFAIRS)],
      schema: {
        tags: ['admin'],
        summary: 'Get a user by ID',
        description: 'Returns a single active user record by UUID. Sensitive fields omitted.',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid', description: 'UUID of the target user' },
          },
        },
        response: {
          200: { type: 'object', description: 'IUserPublic — sensitive fields omitted.' },
          404: { type: 'object' },
        },
      },
    },
    controller.getUserByIdHandler,
  );

  // ── POST /admin/users ─────────────────────────────────────────────────────
  app.post(
    '/admin/users',
    {
      preHandler: [authenticate, requireRoles(Role.SUPER_ADMIN, Role.ACADEMIC_AFFAIRS)],
      schema: {
        tags: ['admin'],
        summary: 'Create a new user account',
        description:
          'Provisions a new user account with a system-generated temporary password ' +
          'delivered via SMS. The account requires a password change and TOTP setup ' +
          'on first login.',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['identifier', 'fullName', 'email', 'phone', 'role'],
          properties: {
            identifier: { type: 'string' },
            fullName: { type: 'string' },
            email: { type: 'string', format: 'email' },
            phone: { type: 'string' },
            role: { type: 'string', enum: Object.values(Role) },
            scopeId: { type: 'string', format: 'uuid' },
          },
        },
        response: {
          201: { type: 'object', description: 'Created IUserPublic — sensitive fields omitted.' },
        },
      },
    },
    controller.createUserHandler,
  );

  // ── PATCH /admin/users/:id ────────────────────────────────────────────────
  app.patch(
    '/admin/users/:id',
    {
      preHandler: [authenticate, requireRoles(Role.SUPER_ADMIN, Role.ACADEMIC_AFFAIRS)],
      schema: {
        tags: ['admin'],
        summary: 'Update a user',
        description:
          'Partially updates a user record. All fields are optional. ' +
          'Role changes are validated for scopeId compatibility.',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
        },
        body: {
          type: 'object',
          properties: {
            fullName: { type: 'string', minLength: 2 },
            email: { type: 'string', format: 'email' },
            phone: { type: 'string', minLength: 10 },
            role: { type: 'string', enum: Object.values(Role) },
            scopeId: { type: 'string', format: 'uuid', nullable: true },
            isActive: { type: 'boolean' },
          },
        },
        response: {
          200: { type: 'object', description: 'Updated IUserPublic — sensitive fields omitted.' },
          404: { type: 'object' },
        },
      },
    },
    controller.updateUserHandler,
  );

  // ── DELETE /admin/users/:id ───────────────────────────────────────────────
  app.delete(
    '/admin/users/:id',
    {
      preHandler: [authenticate, requireRoles(Role.SUPER_ADMIN)],
      schema: {
        tags: ['admin'],
        summary: 'Soft-delete a user',
        description:
          'Sets deletedAt = now() and isActive = false. The record is never hard-deleted. ' +
          'Restricted to SUPER_ADMIN only.',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: { message: { type: 'string' } },
          },
          404: { type: 'object' },
        },
      },
    },
    controller.deleteUserHandler,
  );

  // ── POST /admin/users/import ──────────────────────────────────────────────
  app.post(
    '/admin/users/import',
    {
      preHandler: [authenticate, requireRoles(Role.SUPER_ADMIN)],
      schema: {
        tags: ['admin'],
        summary: 'Bulk import users from a CSV file',
        description:
          'Accepts a multipart CSV file and an optional dryRun field. ' +
          'When dryRun=true, validates rows and returns a preview without creating accounts. ' +
          'When dryRun=false (default), creates all valid accounts and skips duplicates. ' +
          'Restricted to SUPER_ADMIN only.',
        security: [{ bearerAuth: [] }],
        response: {
          200: { type: 'object', description: 'Dry-run preview result.' },
          201: { type: 'object', description: 'Import complete result.' },
          400: { type: 'object', description: 'Validation errors with row-level detail.' },
        },
      },
    },
    controller.importUsersHandler,
  );

  // ── GET /admin/academic-sessions ─────────────────────────────────────────
  app.get(
    '/admin/academic-sessions',
    {
      preHandler: [
        authenticate,
        requireRoles(Role.SUPER_ADMIN, Role.ACADEMIC_AFFAIRS, Role.VICE_CHANCELLOR),
      ],
      schema: {
        tags: ['admin'],
        summary: 'List all academic sessions',
        security: [{ bearerAuth: [] }],
        response: { 200: { type: 'array', items: { type: 'object' } } },
      },
    },
    listAcademicSessionsHandler,
  );

  // ── POST /admin/academic-sessions ────────────────────────────────────────
  app.post(
    '/admin/academic-sessions',
    {
      preHandler: [authenticate, requireRoles(Role.SUPER_ADMIN, Role.ACADEMIC_AFFAIRS)],
      schema: {
        tags: ['admin'],
        summary: 'Create a new academic session',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['name', 'startDate', 'endDate'],
          properties: {
            name: { type: 'string' },
            startDate: { type: 'string', format: 'date-time' },
            endDate: { type: 'string', format: 'date-time' },
          },
        },
        response: { 201: { type: 'object' }, 409: { type: 'object' } },
      },
    },
    createAcademicSessionHandler,
  );

  // ── PATCH /admin/academic-sessions/:id/activate ───────────────────────────
  app.patch(
    '/admin/academic-sessions/:id/activate',
    {
      preHandler: [authenticate, requireRoles(Role.SUPER_ADMIN)],
      schema: {
        tags: ['admin'],
        summary: 'Activate an academic session (deactivates all others)',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        response: { 200: { type: 'object' }, 404: { type: 'object' } },
      },
    },
    activateAcademicSessionHandler,
  );

  // ── POST /admin/academic-sessions/:id/semesters ───────────────────────────
  app.post(
    '/admin/academic-sessions/:id/semesters',
    {
      preHandler: [authenticate, requireRoles(Role.SUPER_ADMIN, Role.ACADEMIC_AFFAIRS)],
      schema: {
        tags: ['admin'],
        summary: 'Create a semester within an academic session',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        body: {
          type: 'object',
          required: ['type', 'startDate', 'endDate'],
          properties: {
            type: { type: 'string', enum: ['FIRST', 'SECOND', 'THIRD'] },
            startDate: { type: 'string', format: 'date-time' },
            endDate: { type: 'string', format: 'date-time' },
            examStartDate: { type: 'string', format: 'date-time' },
            eligibilityComputeDate: { type: 'string', format: 'date-time' },
            eligibilityThreshold: { type: 'number', minimum: 0, maximum: 100 },
            appealWindowDays: { type: 'integer', minimum: 1 },
            maxApprovedExcuses: { type: 'integer', minimum: 0 },
          },
        },
        response: { 201: { type: 'object' }, 404: { type: 'object' }, 409: { type: 'object' } },
      },
    },
    createSemesterHandler,
  );

  // ── PATCH /admin/academic-sessions/:id/semesters/:semesterId/activate ─────
  app.patch(
    '/admin/academic-sessions/:id/semesters/:semesterId/activate',
    {
      preHandler: [authenticate, requireRoles(Role.SUPER_ADMIN)],
      schema: {
        tags: ['admin'],
        summary: 'Activate a semester (deactivates others in same session)',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id', 'semesterId'],
          properties: {
            id: { type: 'string', format: 'uuid' },
            semesterId: { type: 'string', format: 'uuid' },
          },
        },
        response: { 200: { type: 'object' }, 404: { type: 'object' } },
      },
    },
    activateSemesterHandler,
  );

  // ── PATCH /admin/academic-sessions/:id/semesters/:semesterId/freeze ───────
  app.patch(
    '/admin/academic-sessions/:id/semesters/:semesterId/freeze',
    {
      preHandler: [authenticate, requireRoles(Role.SUPER_ADMIN)],
      schema: {
        tags: ['admin'],
        summary: 'Freeze a semester (isFrozen = true)',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id', 'semesterId'],
          properties: {
            id: { type: 'string', format: 'uuid' },
            semesterId: { type: 'string', format: 'uuid' },
          },
        },
        response: { 200: { type: 'object' }, 404: { type: 'object' } },
      },
    },
    freezeSemesterHandler,
  );

  // ── POST /admin/users/:id/reset-totp ─────────────────────────────────────
  app.post(
    '/admin/users/:id/reset-totp',
    {
      preHandler: [authenticate, requireRoles(Role.SUPER_ADMIN)],
      schema: {
        tags: ['admin'],
        summary: 'Reset TOTP enrollment for a user',
        description:
          'Clears totpSecret, sets totpEnrolled = false, and empties totpBackupCodes. ' +
          'The user must re-enroll TOTP on next login. Restricted to SUPER_ADMIN only.',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: { message: { type: 'string' } },
          },
          404: { type: 'object' },
        },
      },
    },
    controller.resetTotpHandler,
  );
}
