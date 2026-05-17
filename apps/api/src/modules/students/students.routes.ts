/**
 * @file students.routes.ts
 * @module modules/students
 *
 * Fastify route registrations for the students module.
 *
 * | Method | Path           | Roles allowed                                              |
 * |--------|----------------|------------------------------------------------------------|
 * | GET    | /students      | SUPER_ADMIN, ACADEMIC_AFFAIRS, DEAN, HOD, LECTURER, EXAM_OFFICER |
 * | GET    | /students/:id  | Above roles + STUDENT                                      |
 * | POST   | /students      | SUPER_ADMIN, ACADEMIC_AFFAIRS                              |
 * | PATCH  | /students/:id  | SUPER_ADMIN, ACADEMIC_AFFAIRS                              |
 */

import { type FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRoles } from '../../middleware/role-guard.js';
import { Role } from '@kwasu-ams/types';
import * as controller from './students.controller.js';

/** Roles permitted to list students. */
const LIST_ROLES = [
  Role.SUPER_ADMIN,
  Role.ACADEMIC_AFFAIRS,
  Role.DEAN,
  Role.HOD,
  Role.LECTURER,
  Role.EXAM_OFFICER,
] as const;

/** Roles permitted to fetch a single student (includes STUDENT for own record). */
const READ_ROLES = [
  Role.SUPER_ADMIN,
  Role.ACADEMIC_AFFAIRS,
  Role.DEAN,
  Role.HOD,
  Role.LECTURER,
  Role.EXAM_OFFICER,
  Role.STUDENT,
] as const;

/** Roles permitted to create and update student records. */
const MANAGE_ROLES = [Role.SUPER_ADMIN, Role.ACADEMIC_AFFAIRS] as const;

/**
 * Registers all student routes on the provided Fastify instance.
 *
 * Called from `app.ts` via `app.register(registerStudentRoutes)`.
 *
 * @param app - The Fastify application instance to register routes on.
 * @returns A promise that resolves once all routes have been registered.
 */
export async function registerStudentRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /students ────────────────────────────────────────────────────────
  app.get(
    '/students',
    {
      preHandler: [authenticate, requireRoles(...LIST_ROLES)],
      schema: {
        tags: ['students'],
        summary: 'List students (scope-aware)',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            programmeId: { type: 'string', format: 'uuid' },
            level: { type: 'integer' },
            search: { type: 'string' },
            page: { type: 'integer', minimum: 1, default: 1 },
            pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          },
        },
        response: { 200: { type: 'object' } },
      },
    },
    controller.listStudentsHandler,
  );

  // ── GET /students/:id ────────────────────────────────────────────────────
  app.get(
    '/students/:id',
    {
      preHandler: [authenticate, requireRoles(...READ_ROLES)],
      schema: {
        tags: ['students'],
        summary: 'Get a student by ID',
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
    controller.getStudentByIdHandler,
  );

  // ── POST /students ───────────────────────────────────────────────────────
  app.post(
    '/students',
    {
      preHandler: [authenticate, requireRoles(...MANAGE_ROLES)],
      schema: {
        tags: ['students'],
        summary: 'Create a new student record',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['userId', 'matricNumber', 'programmeId', 'level'],
          properties: {
            userId: { type: 'string', format: 'uuid' },
            matricNumber: { type: 'string' },
            programmeId: { type: 'string', format: 'uuid' },
            level: { type: 'integer', enum: [100, 200, 300, 400, 500, 600] },
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
    controller.createStudentHandler,
  );

  // ── PATCH /students/:id ──────────────────────────────────────────────────
  app.patch(
    '/students/:id',
    {
      preHandler: [authenticate, requireRoles(...MANAGE_ROLES)],
      schema: {
        tags: ['students'],
        summary: 'Update a student record',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        body: {
          type: 'object',
          properties: {
            programmeId: { type: 'string', format: 'uuid' },
            level: { type: 'integer', enum: [100, 200, 300, 400, 500, 600] },
            hasCarryOver: { type: 'boolean' },
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
    controller.updateStudentHandler,
  );
}
