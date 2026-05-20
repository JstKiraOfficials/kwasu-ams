/**
 * @file devices.routes.ts
 * @module modules/devices
 *
 * Fastify route registrations for the device binding module.
 *
 * | Method | Path                          | Roles allowed                    |
 * |--------|-------------------------------|----------------------------------|
 * | GET    | /devices                      | STUDENT (own devices)            |
 * | POST   | /devices                      | STUDENT                          |
 * | DELETE | /devices/:id                  | STUDENT, SUPER_ADMIN             |
 * | POST   | /admin/devices/:id/approve    | SUPER_ADMIN only                 |
 * | GET    | /admin/users/:userId/devices  | SUPER_ADMIN, ACADEMIC_AFFAIRS    |
 */

import { type FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRoles } from '../../middleware/role-guard.js';
import { Role } from '@kwasu-ams/types';
import * as controller from './devices.controller.js';

/**
 * Registers all device binding routes on the provided Fastify instance.
 *
 * Called from `app.ts` via `app.register(registerDeviceRoutes)`.
 *
 * @param app - The Fastify application instance to register routes on.
 * @returns A promise that resolves once all routes have been registered.
 */
export async function registerDeviceRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /devices ─────────────────────────────────────────────────────────
  app.get(
    '/devices',
    {
      preHandler: [authenticate, requireRoles(Role.STUDENT)],
      schema: {
        tags: ['devices'],
        summary: 'List own device bindings',
        security: [{ bearerAuth: [] }],
        response: { 200: { type: 'array', items: { type: 'object' } } },
      },
    },
    controller.listDevicesHandler,
  );

  // ── POST /devices ────────────────────────────────────────────────────────
  app.post(
    '/devices',
    {
      preHandler: [authenticate, requireRoles(Role.STUDENT)],
      schema: {
        tags: ['devices'],
        summary: 'Register a new device',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['deviceFingerprint', 'platform'],
          properties: {
            deviceFingerprint: { type: 'string', minLength: 10 },
            platform: { type: 'string', enum: ['ios', 'android'] },
            deviceModel: { type: 'string' },
            osVersion: { type: 'string' },
            isPrimary: { type: 'boolean', default: true },
          },
        },
        response: {
          201: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              userId: { type: 'string' },
              deviceFingerprint: { type: 'string' },
              platform: { type: 'string' },
              deviceModel: { type: 'string', nullable: true },
              osVersion: { type: 'string', nullable: true },
              isPrimary: { type: 'boolean' },
              status: { type: 'string' },
              registeredAt: { type: 'string' },
              lastSeenAt: { type: 'string', nullable: true },
              revokedAt: { type: 'string', nullable: true },
              revokedReason: { type: 'string', nullable: true },
            },
          },
          // 400 intentionally omitted — AppError responses go through setErrorHandler
          // which bypasses route schema serialization for undeclared status codes
          403: { type: 'object' },
        },
      },
    },
    controller.registerDeviceHandler,
  );

  // ── DELETE /devices/:id ──────────────────────────────────────────────────
  app.delete(
    '/devices/:id',
    {
      preHandler: [authenticate, requireRoles(Role.STUDENT, Role.SUPER_ADMIN)],
      schema: {
        tags: ['devices'],
        summary: 'Revoke a device binding',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        body: {
          type: 'object',
          required: ['reason'],
          properties: { reason: { type: 'string', minLength: 5 } },
        },
        response: {
          200: { type: 'object', properties: { message: { type: 'string' } } },
          403: { type: 'object' },
          404: { type: 'object' },
        },
      },
    },
    controller.revokeDeviceHandler,
  );

  // ── POST /admin/devices/:id/approve ──────────────────────────────────────
  app.post(
    '/admin/devices/:id/approve',
    {
      preHandler: [authenticate, requireRoles(Role.SUPER_ADMIN)],
      schema: {
        tags: ['devices'],
        summary: 'Approve a pending device binding (SUPER_ADMIN only)',
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
    controller.approveDeviceHandler,
  );

  // ── GET /admin/users/:userId/devices ─────────────────────────────────────
  app.get(
    '/admin/users/:userId/devices',
    {
      preHandler: [authenticate, requireRoles(Role.SUPER_ADMIN, Role.ACADEMIC_AFFAIRS)],
      schema: {
        tags: ['devices'],
        summary: "List a specific user's device bindings",
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['userId'],
          properties: { userId: { type: 'string', format: 'uuid' } },
        },
        response: { 200: { type: 'array', items: { type: 'object' } } },
      },
    },
    controller.listUserDevicesHandler,
  );
}
