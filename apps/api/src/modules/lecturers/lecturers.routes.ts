/**
 * @file lecturers.routes.ts
 * @module modules/lecturers
 *
 * Fastify route registrations for the lecturers module.
 *
 * | Method | Path             | Roles allowed                                    |
 * |--------|------------------|--------------------------------------------------|
 * | GET    | /lecturers       | SUPER_ADMIN, ACADEMIC_AFFAIRS, DEAN, HOD         |
 * | GET    | /lecturers/:id   | Above roles + LECTURER (own record)              |
 * | POST   | /lecturers       | SUPER_ADMIN, ACADEMIC_AFFAIRS                    |
 * | PATCH  | /lecturers/:id   | SUPER_ADMIN, ACADEMIC_AFFAIRS                    |
 */

import { type FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRoles } from '../../middleware/role-guard.js';
import { Role } from '@kwasu-ams/types';
import * as controller from './lecturers.controller.js';

/** Roles permitted to list lecturers. */
const LIST_ROLES = [Role.SUPER_ADMIN, Role.ACADEMIC_AFFAIRS, Role.DEAN, Role.HOD] as const;

/** Roles permitted to fetch a single lecturer (includes LECTURER for own record). */
const READ_ROLES = [
  Role.SUPER_ADMIN,
  Role.ACADEMIC_AFFAIRS,
  Role.DEAN,
  Role.HOD,
  Role.LECTURER,
] as const;

/** Roles permitted to create and update lecturer records. */
const MANAGE_ROLES = [Role.SUPER_ADMIN, Role.ACADEMIC_AFFAIRS] as const;

/**
 * Registers all lecturer routes on the provided Fastify instance.
 *
 * Called from `app.ts` via `app.register(registerLecturerRoutes)`.
 *
 * @param app - The Fastify application instance to register routes on.
 * @returns A promise that resolves once all routes have been registered.
 */
export async function registerLecturerRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /lecturers ───────────────────────────────────────────────────────
  app.get(
    '/lecturers',
    {
      preHandler: [authenticate, requireRoles(...LIST_ROLES)],
      schema: {
        tags: ['lecturers'],
        summary: 'List lecturers (scope-aware)',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            departmentId: { type: 'string', format: 'uuid' },
            search: { type: 'string' },
            page: { type: 'integer', minimum: 1, default: 1 },
            pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          },
        },
        response: { 200: { type: 'object' } },
      },
    },
    controller.listLecturersHandler,
  );

  // ── GET /lecturers/:id ───────────────────────────────────────────────────
  app.get(
    '/lecturers/:id',
    {
      preHandler: [authenticate, requireRoles(...READ_ROLES)],
      schema: {
        tags: ['lecturers'],
        summary: 'Get a lecturer by ID',
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
    controller.getLecturerByIdHandler,
  );

  // ── POST /lecturers ──────────────────────────────────────────────────────
  app.post(
    '/lecturers',
    {
      preHandler: [authenticate, requireRoles(...MANAGE_ROLES)],
      schema: {
        tags: ['lecturers'],
        summary: 'Create a new lecturer record',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['userId', 'staffId', 'departmentId'],
          properties: {
            userId: { type: 'string', format: 'uuid' },
            staffId: { type: 'string' },
            departmentId: { type: 'string', format: 'uuid' },
            title: { type: 'string' },
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
    controller.createLecturerHandler,
  );

  // ── PATCH /lecturers/:id ─────────────────────────────────────────────────
  app.patch(
    '/lecturers/:id',
    {
      preHandler: [authenticate, requireRoles(...MANAGE_ROLES)],
      schema: {
        tags: ['lecturers'],
        summary: 'Update a lecturer record',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        body: {
          type: 'object',
          properties: {
            departmentId: { type: 'string', format: 'uuid' },
            title: { type: 'string' },
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
    controller.updateLecturerHandler,
  );
}
