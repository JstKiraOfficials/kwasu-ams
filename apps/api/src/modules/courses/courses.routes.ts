/**
 * @file courses.routes.ts
 * @module modules/courses
 *
 * Fastify route registrations for the courses module.
 *
 * | Method | Path                                          | Roles allowed                                         |
 * |--------|-----------------------------------------------|-------------------------------------------------------|
 * | GET    | /courses                                      | All authenticated roles (SUPER_ADMIN … STUDENT)       |
 * | GET    | /courses/:id                                  | All authenticated roles                               |
 * | POST   | /courses                                      | SUPER_ADMIN, ACADEMIC_AFFAIRS                         |
 * | PATCH  | /courses/:id                                  | SUPER_ADMIN, ACADEMIC_AFFAIRS                         |
 * | DELETE | /courses/:id                                  | SUPER_ADMIN only                                      |
 * | POST   | /courses/:id/sections                         | SUPER_ADMIN, ACADEMIC_AFFAIRS, HOD                    |
 * | POST   | /courses/:id/sections/:sectionId/enroll       | SUPER_ADMIN, ACADEMIC_AFFAIRS, HOD                    |
 * | PATCH  | /courses/:id/sections/:sectionId/lecturer     | SUPER_ADMIN, ACADEMIC_AFFAIRS, HOD                    |
 * | GET    | /courses/:id/students                         | SUPER_ADMIN, ACADEMIC_AFFAIRS, DEAN, HOD, LECTURER    |
 */

import { type FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRoles } from '../../middleware/role-guard.js';
import { Role } from '@kwasu-ams/types';
import * as controller from './courses.controller.js';

/** Roles permitted to read course data. */
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

/** Roles permitted to manage courses (create/update). */
const MANAGE_ROLES = [Role.SUPER_ADMIN, Role.ACADEMIC_AFFAIRS] as const;

/** Roles permitted to manage sections and enrollments. */
const SECTION_ROLES = [Role.SUPER_ADMIN, Role.ACADEMIC_AFFAIRS, Role.HOD] as const;

/** Roles permitted to view course student lists. */
const STUDENT_LIST_ROLES = [
  Role.SUPER_ADMIN,
  Role.ACADEMIC_AFFAIRS,
  Role.DEAN,
  Role.HOD,
  Role.LECTURER,
] as const;

/**
 * Registers all course routes on the provided Fastify instance.
 *
 * Called from `app.ts` via `app.register(registerCourseRoutes)`.
 *
 * @param app - The Fastify application instance to register routes on.
 * @returns A promise that resolves once all routes have been registered.
 */
export async function registerCourseRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /courses ────────────────────────────────────────────────────────
  app.get(
    '/courses',
    {
      preHandler: [authenticate, requireRoles(...READ_ROLES)],
      schema: {
        tags: ['courses'],
        summary: 'List courses (scope-aware)',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            departmentId: { type: 'string', format: 'uuid' },
            level: { type: 'integer' },
            semesterId: { type: 'string', format: 'uuid' },
            page: { type: 'integer', minimum: 1, default: 1 },
            pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          },
        },
        response: { 200: { type: 'object' } },
      },
    },
    controller.listCoursesHandler,
  );

  // ── GET /courses/:id ────────────────────────────────────────────────────
  app.get(
    '/courses/:id',
    {
      preHandler: [authenticate, requireRoles(...READ_ROLES)],
      schema: {
        tags: ['courses'],
        summary: 'Get a course by ID (with sections)',
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
    controller.getCourseByIdHandler,
  );

  // ── POST /courses ───────────────────────────────────────────────────────
  app.post(
    '/courses',
    {
      preHandler: [authenticate, requireRoles(...MANAGE_ROLES)],
      schema: {
        tags: ['courses'],
        summary: 'Create a new course',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['departmentId', 'code', 'title', 'creditUnits', 'level'],
          properties: {
            departmentId: { type: 'string', format: 'uuid' },
            code: { type: 'string', minLength: 3, maxLength: 10 },
            title: { type: 'string', minLength: 3 },
            creditUnits: { type: 'integer', minimum: 1, maximum: 6 },
            level: { type: 'integer', enum: [100, 200, 300, 400, 500, 600] },
            isElective: { type: 'boolean', default: false },
          },
        },
        response: {
          201: { type: 'object' },
          400: { type: 'object' },
          403: { type: 'object' },
          409: { type: 'object' },
        },
      },
    },
    controller.createCourseHandler,
  );

  // ── PATCH /courses/:id ──────────────────────────────────────────────────
  app.patch(
    '/courses/:id',
    {
      preHandler: [authenticate, requireRoles(...MANAGE_ROLES)],
      schema: {
        tags: ['courses'],
        summary: 'Update a course',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        body: {
          type: 'object',
          properties: {
            code: { type: 'string', minLength: 3, maxLength: 10 },
            title: { type: 'string', minLength: 3 },
            creditUnits: { type: 'integer', minimum: 1, maximum: 6 },
            level: { type: 'integer', enum: [100, 200, 300, 400, 500, 600] },
            isElective: { type: 'boolean' },
          },
        },
        response: {
          200: { type: 'object' },
          400: { type: 'object' },
          403: { type: 'object' },
          404: { type: 'object' },
        },
      },
    },
    controller.updateCourseHandler,
  );

  // ── DELETE /courses/:id ─────────────────────────────────────────────────
  app.delete(
    '/courses/:id',
    {
      preHandler: [authenticate, requireRoles(Role.SUPER_ADMIN)],
      schema: {
        tags: ['courses'],
        summary: 'Delete a course (SUPER_ADMIN only)',
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
          409: { type: 'object' },
        },
      },
    },
    controller.deleteCourseHandler,
  );

  // ── POST /courses/:id/sections ──────────────────────────────────────────
  app.post(
    '/courses/:id/sections',
    {
      preHandler: [authenticate, requireRoles(...SECTION_ROLES)],
      schema: {
        tags: ['courses'],
        summary: 'Create a course section',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        body: {
          type: 'object',
          required: ['sectionLabel', 'semesterId'],
          properties: {
            sectionLabel: { type: 'string', minLength: 1, maxLength: 5 },
            semesterId: { type: 'string', format: 'uuid' },
            lecturerId: { type: 'string', format: 'uuid' },
            maxEnrollment: { type: 'integer', minimum: 1, default: 200 },
          },
        },
        response: {
          201: { type: 'object' },
          400: { type: 'object' },
          403: { type: 'object' },
          409: { type: 'object' },
        },
      },
    },
    controller.createSectionHandler,
  );

  // ── POST /courses/:id/sections/:sectionId/enroll ────────────────────────
  app.post(
    '/courses/:id/sections/:sectionId/enroll',
    {
      preHandler: [authenticate, requireRoles(...SECTION_ROLES)],
      schema: {
        tags: ['courses'],
        summary: 'Batch-enroll students into a course section',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id', 'sectionId'],
          properties: {
            id: { type: 'string', format: 'uuid' },
            sectionId: { type: 'string', format: 'uuid' },
          },
        },
        body: {
          type: 'object',
          required: ['studentIds'],
          properties: {
            studentIds: {
              type: 'array',
              items: { type: 'string', format: 'uuid' },
              minItems: 1,
              maxItems: 500,
            },
            isCarryOver: { type: 'boolean', default: false },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              enrolled: { type: 'integer' },
              skipped: { type: 'integer' },
            },
          },
          400: { type: 'object' },
          403: { type: 'object' },
          409: { type: 'object' },
        },
      },
    },
    controller.enrollStudentsHandler,
  );

  // ── PATCH /courses/:id/sections/:sectionId/lecturer ─────────────────────
  app.patch(
    '/courses/:id/sections/:sectionId/lecturer',
    {
      preHandler: [authenticate, requireRoles(...SECTION_ROLES)],
      schema: {
        tags: ['courses'],
        summary: 'Assign a lecturer to a course section',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id', 'sectionId'],
          properties: {
            id: { type: 'string', format: 'uuid' },
            sectionId: { type: 'string', format: 'uuid' },
          },
        },
        body: {
          type: 'object',
          required: ['lecturerId'],
          properties: {
            lecturerId: { type: 'string', format: 'uuid' },
          },
        },
        response: {
          200: { type: 'object' },
          400: { type: 'object' },
          403: { type: 'object' },
          404: { type: 'object' },
        },
      },
    },
    controller.assignLecturerHandler,
  );

  // ── GET /courses/:id/students ───────────────────────────────────────────
  app.get(
    '/courses/:id/students',
    {
      preHandler: [authenticate, requireRoles(...STUDENT_LIST_ROLES)],
      schema: {
        tags: ['courses'],
        summary: 'List students enrolled in a course section with attendance summary',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'integer', minimum: 1, default: 1 },
            pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          },
        },
        response: {
          200: { type: 'object' },
          403: { type: 'object' },
          404: { type: 'object' },
        },
      },
    },
    controller.getCourseStudentsHandler,
  );
}
