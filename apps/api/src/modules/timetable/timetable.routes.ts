/**
 * @file timetable.routes.ts
 * @module modules/timetable
 *
 * Fastify route registrations for the timetable module.
 *
 * | Method | Path                              | Roles allowed                                      |
 * |--------|-----------------------------------|----------------------------------------------------|
 * | GET    | /timetable                        | All authenticated roles (SUPER_ADMIN … STUDENT)    |
 * | GET    | /timetable/:id                    | All authenticated roles                            |
 * | POST   | /timetable                        | SUPER_ADMIN, ACADEMIC_AFFAIRS                      |
 * | PATCH  | /timetable/:id                    | SUPER_ADMIN, ACADEMIC_AFFAIRS                      |
 * | DELETE | /timetable/:id                    | SUPER_ADMIN, ACADEMIC_AFFAIRS                      |
 * | GET    | /timetable/student/:studentId     | SUPER_ADMIN, ACADEMIC_AFFAIRS, HOD, LECTURER, STUDENT |
 * | GET    | /timetable/lecturer/:lecturerId   | SUPER_ADMIN, ACADEMIC_AFFAIRS, HOD, LECTURER       |
 *
 * Note: static sub-paths (`/student/:studentId`, `/lecturer/:lecturerId`) are
 * registered before the dynamic `/:id` route to prevent Fastify from matching
 * "student" or "lecturer" as an `id` parameter.
 */

import { type FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRoles } from '../../middleware/role-guard.js';
import { Role } from '@kwasu-ams/types';
import * as controller from './timetable.controller.js';

/** Roles permitted to read timetable data. */
const READ_ROLES = [
  Role.SUPER_ADMIN,
  Role.ACADEMIC_AFFAIRS,
  Role.DEAN,
  Role.HOD,
  Role.LECTURER,
  Role.STUDENT,
] as const;

/** Roles permitted to create, update, and delete timetable entries. */
const MANAGE_ROLES = [Role.SUPER_ADMIN, Role.ACADEMIC_AFFAIRS] as const;

/** Roles permitted to view a student's personal timetable. */
const STUDENT_TIMETABLE_ROLES = [
  Role.SUPER_ADMIN,
  Role.ACADEMIC_AFFAIRS,
  Role.HOD,
  Role.LECTURER,
  Role.STUDENT,
] as const;

/** Roles permitted to view a lecturer's personal timetable. */
const LECTURER_TIMETABLE_ROLES = [
  Role.SUPER_ADMIN,
  Role.ACADEMIC_AFFAIRS,
  Role.HOD,
  Role.LECTURER,
] as const;

/**
 * Registers all timetable routes on the provided Fastify instance.
 *
 * Static sub-path routes (`/student/:studentId`, `/lecturer/:lecturerId`) are
 * registered before the dynamic `/:id` route to ensure correct matching.
 *
 * Called from `app.ts` via `app.register(registerTimetableRoutes)`.
 *
 * @param app - The Fastify application instance to register routes on.
 * @returns A promise that resolves once all routes have been registered.
 */
export async function registerTimetableRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /timetable/student/:studentId ────────────────────────────────────
  // Registered before /:id to prevent "student" being matched as an id param
  app.get(
    '/timetable/student/:studentId',
    {
      preHandler: [authenticate, requireRoles(...STUDENT_TIMETABLE_ROLES)],
      schema: {
        tags: ['timetable'],
        summary: "Get a student's personal timetable",
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
        response: {
          200: { type: 'array', items: { type: 'object' } },
          403: { type: 'object' },
          404: { type: 'object' },
        },
      },
    },
    controller.getStudentTimetableHandler,
  );

  // ── GET /timetable/lecturer/:lecturerId ──────────────────────────────────
  app.get(
    '/timetable/lecturer/:lecturerId',
    {
      preHandler: [authenticate, requireRoles(...LECTURER_TIMETABLE_ROLES)],
      schema: {
        tags: ['timetable'],
        summary: "Get a lecturer's personal timetable",
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['lecturerId'],
          properties: { lecturerId: { type: 'string', format: 'uuid' } },
        },
        querystring: {
          type: 'object',
          properties: { semesterId: { type: 'string', format: 'uuid' } },
        },
        response: {
          200: { type: 'array', items: { type: 'object' } },
          403: { type: 'object' },
          404: { type: 'object' },
        },
      },
    },
    controller.getLecturerTimetableHandler,
  );

  // ── GET /timetable ───────────────────────────────────────────────────────
  app.get(
    '/timetable',
    {
      preHandler: [authenticate, requireRoles(...READ_ROLES)],
      schema: {
        tags: ['timetable'],
        summary: 'List timetable entries',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            semesterId: { type: 'string', format: 'uuid' },
            courseSectionId: { type: 'string', format: 'uuid' },
            venueId: { type: 'string', format: 'uuid' },
            dayOfWeek: {
              type: 'string',
              enum: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'],
            },
            page: { type: 'integer', minimum: 1, default: 1 },
            pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          },
        },
        response: { 200: { type: 'object' } },
      },
    },
    controller.listTimetableEntriesHandler,
  );

  // ── GET /timetable/:id ───────────────────────────────────────────────────
  app.get(
    '/timetable/:id',
    {
      preHandler: [authenticate, requireRoles(...READ_ROLES)],
      schema: {
        tags: ['timetable'],
        summary: 'Get a timetable entry by ID',
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
    controller.getTimetableEntryByIdHandler,
  );

  // ── POST /timetable ──────────────────────────────────────────────────────
  app.post(
    '/timetable',
    {
      preHandler: [authenticate, requireRoles(...MANAGE_ROLES)],
      schema: {
        tags: ['timetable'],
        summary: 'Create a timetable entry (with conflict detection)',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: [
            'courseSectionId',
            'semesterId',
            'venueId',
            'dayOfWeek',
            'startTime',
            'endTime',
          ],
          properties: {
            courseSectionId: { type: 'string', format: 'uuid' },
            semesterId: { type: 'string', format: 'uuid' },
            venueId: { type: 'string', format: 'uuid' },
            dayOfWeek: {
              type: 'string',
              enum: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'],
            },
            startTime: { type: 'string', pattern: '^\\d{2}:\\d{2}$' },
            endTime: { type: 'string', pattern: '^\\d{2}:\\d{2}$' },
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
    controller.createTimetableEntryHandler,
  );

  // ── PATCH /timetable/:id ─────────────────────────────────────────────────
  app.patch(
    '/timetable/:id',
    {
      preHandler: [authenticate, requireRoles(...MANAGE_ROLES)],
      schema: {
        tags: ['timetable'],
        summary: 'Update a timetable entry (with conflict detection)',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        body: {
          type: 'object',
          properties: {
            courseSectionId: { type: 'string', format: 'uuid' },
            semesterId: { type: 'string', format: 'uuid' },
            venueId: { type: 'string', format: 'uuid' },
            dayOfWeek: {
              type: 'string',
              enum: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'],
            },
            startTime: { type: 'string', pattern: '^\\d{2}:\\d{2}$' },
            endTime: { type: 'string', pattern: '^\\d{2}:\\d{2}$' },
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
    controller.updateTimetableEntryHandler,
  );

  // ── DELETE /timetable/:id ────────────────────────────────────────────────
  app.delete(
    '/timetable/:id',
    {
      preHandler: [authenticate, requireRoles(...MANAGE_ROLES)],
      schema: {
        tags: ['timetable'],
        summary: 'Delete a timetable entry',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        response: {
          200: {
            type: 'object',
            properties: { message: { type: 'string' } },
          },
          403: { type: 'object' },
          404: { type: 'object' },
        },
      },
    },
    controller.deleteTimetableEntryHandler,
  );
}
