/**
 * @file attendance.routes.ts
 * @module modules/attendance
 *
 * Fastify route registrations for the attendance module.
 *
 * | Method | Path                     | Roles   | Description                              |
 * |--------|--------------------------|---------|------------------------------------------|
 * | POST   | /attendance/checkin/gps  | STUDENT | GPS direct check-in with geofence        |
 * | GET    | /attendance              | STUDENT | List own attendance records (paginated)  |
 *
 * Guard chain for all routes: `authenticate → requireRoles(STUDENT)`.
 */

import { type FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRoles } from '../../middleware/role-guard.js';
import { Role } from '@kwasu-ams/types';
import { checkInGpsHandler, listAttendanceHandler } from './attendance.controller.js';

/**
 * Registers all attendance routes on the provided Fastify instance.
 *
 * Called from `app.ts` via `app.register(registerAttendanceRoutes)`.
 *
 * @param app - The Fastify application instance to register routes on.
 * @returns A promise that resolves once all routes have been registered.
 */
export async function registerAttendanceRoutes(app: FastifyInstance): Promise<void> {
  // ── POST /attendance/checkin/gps ─────────────────────────────────────────
  app.post(
    '/attendance/checkin/gps',
    {
      preHandler: [authenticate, requireRoles(Role.STUDENT)],
      schema: {
        tags: ['attendance'],
        summary: 'GPS direct check-in',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['sessionId', 'latitude', 'longitude', 'deviceFingerprint'],
          properties: {
            sessionId: { type: 'string', format: 'uuid' },
            latitude: { type: 'number', minimum: -90, maximum: 90 },
            longitude: { type: 'number', minimum: -180, maximum: 180 },
            deviceFingerprint: { type: 'string', minLength: 1 },
            mockLocationEnabled: { type: 'boolean', default: false },
            deviceRooted: { type: 'boolean', default: false },
          },
        },
        response: {
          201: { type: 'object', additionalProperties: true },
        },
      },
    },
    checkInGpsHandler,
  );

  // ── GET /attendance ──────────────────────────────────────────────────────
  app.get(
    '/attendance',
    {
      preHandler: [authenticate, requireRoles(Role.STUDENT)],
      schema: {
        tags: ['attendance'],
        summary: 'List own attendance records (paginated)',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            courseSectionId: { type: 'string', format: 'uuid' },
            semesterId: { type: 'string', format: 'uuid' },
            status: {
              type: 'string',
              enum: ['PRESENT', 'ABSENT', 'EXCUSED', 'LATE', 'MANUAL_OVERRIDE', 'PENDING_REVIEW'],
            },
            page: { type: 'integer', minimum: 1, default: 1 },
            pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          },
        },
        response: {
          200: { type: 'object', additionalProperties: true },
        },
      },
    },
    listAttendanceHandler,
  );
}
