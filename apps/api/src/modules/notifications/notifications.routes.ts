/**
 * @file notifications.routes.ts
 * @module modules/notifications
 *
 * Fastify route registrations for the notifications module.
 *
 * | Method | Path                           | Roles                          |
 * |--------|--------------------------------|--------------------------------|
 * | GET    | /notifications                 | authenticated (any role)       |
 * | PATCH  | /notifications/:id/read        | authenticated (any role)       |
 * | POST   | /notifications/fcm-token       | authenticated (any role)       |
 * | POST   | /notifications/warn-student    | LECTURER, HOD, SUPER_ADMIN     |
 */

import { type FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRoles } from '../../middleware/role-guard.js';
import { Role } from '@kwasu-ams/types';
import * as controller from './notifications.controller.js';

/**
 * Registers all notification routes on the provided Fastify instance.
 *
 * @param app - The Fastify application instance to register routes on.
 * @returns A promise that resolves once all routes have been registered.
 */
export async function registerNotificationRoutes(app: FastifyInstance): Promise<void> {
  // ── POST /notifications/fcm-token ────────────────────────────────────────
  // Registered before /:id routes to avoid param matching
  app.post(
    '/notifications/fcm-token',
    {
      preHandler: [authenticate],
      schema: {
        tags: ['notifications'],
        summary: 'Register a Firebase Cloud Messaging device token',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['fcmToken'],
          properties: { fcmToken: { type: 'string', minLength: 10 } },
        },
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    controller.registerFcmTokenHandler,
  );

  // ── POST /notifications/warn-student ─────────────────────────────────────
  app.post(
    '/notifications/warn-student',
    {
      preHandler: [authenticate, requireRoles(Role.LECTURER, Role.HOD, Role.SUPER_ADMIN)],
      schema: {
        tags: ['notifications'],
        summary: 'Manually trigger a STUDENT_BELOW_75 warning notification',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['studentId', 'courseSectionId'],
          properties: {
            studentId: { type: 'string', format: 'uuid' },
            courseSectionId: { type: 'string', format: 'uuid' },
          },
        },
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    controller.warnStudentHandler,
  );

  // ── GET /notifications ───────────────────────────────────────────────────
  app.get(
    '/notifications',
    {
      preHandler: [authenticate],
      schema: {
        tags: ['notifications'],
        summary: 'List own notifications (paginated)',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            channel: { type: 'string', enum: ['PUSH', 'SMS', 'EMAIL'] },
            page: { type: 'integer', minimum: 1, default: 1 },
            pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          },
        },
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    controller.listNotificationsHandler,
  );

  // ── PATCH /notifications/:id/read ────────────────────────────────────────
  app.patch(
    '/notifications/:id/read',
    {
      preHandler: [authenticate],
      schema: {
        tags: ['notifications'],
        summary: 'Mark a notification as read',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    controller.markAsReadHandler,
  );
}
