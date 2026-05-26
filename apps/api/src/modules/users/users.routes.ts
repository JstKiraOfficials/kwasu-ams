/**
 * @file users.routes.ts
 * @module modules/users
 *
 * Fastify route registrations for the users module.
 *
 * | Method | Path                   | Guards       | Description                  |
 * |--------|------------------------|--------------|------------------------------|
 * | GET    | /users/me              | authenticate | Get current user profile     |
 * | PATCH  | /users/me              | authenticate | Update own profile           |
 * | POST   | /users/me/data-export  | authenticate | Request NDPA data export PDF |
 * | GET    | /users/me/access-log   | authenticate | Transparency access log      |
 *
 * All routes require authentication. No role restriction — every user can
 * access their own profile and exercise NDPA data rights.
 */

import { type FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate.js';
import {
  getCurrentUserHandler,
  updateProfileHandler,
  requestDataExportHandler,
  getAccessLogHandler,
} from './users.controller.js';

/**
 * Registers all user profile routes on the provided Fastify instance.
 *
 * @param app - The Fastify application instance to register routes on.
 * @returns A promise that resolves once all routes have been registered.
 */
export async function registerUserRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /users/me ─────────────────────────────────────────────────────────
  app.get(
    '/users/me',
    {
      preHandler: [authenticate],
      schema: {
        tags: ['users'],
        summary: 'Get current user profile',
        description:
          "Returns the authenticated user's public profile. Sensitive fields (passwordHash, totpSecret, etc.) are never included.",
        security: [{ bearerAuth: [] }],
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    getCurrentUserHandler,
  );

  // ── PATCH /users/me ───────────────────────────────────────────────────────
  app.patch(
    '/users/me',
    {
      preHandler: [authenticate],
      schema: {
        tags: ['users'],
        summary: 'Update own profile',
        description:
          'Updates email, phone, languagePreference, or notification preferences. Writes USER_UPDATED audit log entry.',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          properties: {
            email: { type: 'string', format: 'email' },
            phone: { type: 'string', minLength: 10 },
            languagePreference: { type: 'string', enum: ['en', 'yo'] },
          },
        },
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    updateProfileHandler,
  );

  // ── POST /users/me/data-export ────────────────────────────────────────────
  app.post(
    '/users/me/data-export',
    {
      preHandler: [authenticate],
      schema: {
        tags: ['users'],
        summary: 'Request personal data export (NDPA right of access)',
        description:
          'Generates a PDF of all personal data held about the user and delivers it to their registered email address. GPS coordinates are not stored. Required under NDPA 2023.',
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            properties: { message: { type: 'string' } },
          },
        },
      },
    },
    requestDataExportHandler,
  );

  // ── GET /users/me/access-log ──────────────────────────────────────────────
  app.get(
    '/users/me/access-log',
    {
      preHandler: [authenticate],
      schema: {
        tags: ['users'],
        summary: 'Get transparency access log',
        description:
          "Returns a paginated log showing which roles accessed the user's attendance, eligibility, or excuse records and when.",
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'integer', minimum: 1, default: 1 },
            pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          },
        },
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    getAccessLogHandler,
  );
}
