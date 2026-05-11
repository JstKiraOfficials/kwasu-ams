/**
 * @file admin.routes.ts
 * @module modules/admin
 *
 * Fastify route registrations for the admin account-provisioning module.
 *
 * All routes require authentication and are restricted to privileged roles:
 *
 * | Method | Path                  | Roles allowed                        |
 * |--------|-----------------------|--------------------------------------|
 * | POST   | /admin/users          | SUPER_ADMIN, ACADEMIC_AFFAIRS        |
 * | POST   | /admin/users/import   | SUPER_ADMIN only                     |
 *
 * Guard chain: `authenticate → requireRoles(...)` on every route.
 */

import { type FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRoles } from '../../middleware/role-guard.js';
import { Role } from '@kwasu-ams/types';
import * as controller from './admin.controller.js';

/**
 * Registers all admin provisioning routes on the provided Fastify instance.
 *
 * Called from `app.ts` via `app.register(registerAdminRoutes)`.
 *
 * @param app - The Fastify application instance to register routes on.
 */
export async function registerAdminRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /admin/users
   * Creates a single user account with a system-generated temporary password.
   * Restricted to SUPER_ADMIN and ACADEMIC_AFFAIRS roles.
   */
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
          'on first login. Restricted to SUPER_ADMIN and ACADEMIC_AFFAIRS.',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['identifier', 'fullName', 'email', 'phone', 'role'],
          properties: {
            identifier: {
              type: 'string',
              description: 'Matric number (students) or staff ID (staff)',
            },
            fullName: { type: 'string', description: 'Full legal name' },
            email: { type: 'string', format: 'email', description: 'Institutional email address' },
            phone: {
              type: 'string',
              description: 'Phone number for SMS delivery of temp password',
            },
            role: {
              type: 'string',
              enum: Object.values(Role),
              description: 'User role — determines identifier format validation',
            },
            scopeId: {
              type: 'string',
              format: 'uuid',
              description:
                'Faculty UUID (DEAN) or Department UUID (HOD/LECTURER). Omit for SUPER_ADMIN/VC.',
            },
          },
        },
        response: {
          201: {
            type: 'object',
            description:
              'Created user record — sensitive fields (passwordHash, totpSecret, etc.) omitted.',
          },
        },
      },
    },
    controller.createUserHandler,
  );

  /**
   * POST /admin/users/import
   * Accepts a multipart CSV file, uploads it to S3, and queues a bulk
   * account-creation job. Returns 202 Accepted with a job ID for polling.
   * Restricted to SUPER_ADMIN only.
   */
  app.post(
    '/admin/users/import',
    {
      preHandler: [authenticate, requireRoles(Role.SUPER_ADMIN)],
      schema: {
        tags: ['admin'],
        summary: 'Bulk import users from a CSV file',
        description:
          'Uploads the CSV to S3 and enqueues a BullMQ job to process it ' +
          'asynchronously. Each row is validated, a temporary password is generated, ' +
          'and an SMS is sent. Returns immediately with a job ID. ' +
          'Restricted to SUPER_ADMIN only.',
        security: [{ bearerAuth: [] }],
        response: {
          202: {
            type: 'object',
            properties: {
              jobId: { type: 'string', description: 'Unique identifier for the import job' },
              message: { type: 'string' },
            },
          },
        },
      },
    },
    controller.importUsersHandler,
  );
}
