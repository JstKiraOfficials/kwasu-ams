/**
 * @file support.routes.ts
 * @module modules/support
 *
 * Fastify route registrations for the support ticket module.
 *
 * | Method | Path         | Roles                                    | Description          |
 * |--------|--------------|------------------------------------------|----------------------|
 * | GET    | /support     | authenticated                            | List own tickets     |
 * | GET    | /support/:id | authenticated                            | Get ticket by ID     |
 * | POST   | /support     | authenticated                            | Create ticket        |
 * | PATCH  | /support/:id | SUPER_ADMIN, ACADEMIC_AFFAIRS, HOD       | Update ticket        |
 */

import { type FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRoles } from '../../middleware/role-guard.js';
import { Role } from '@kwasu-ams/types';
import {
  createTicketHandler,
  listTicketsHandler,
  getTicketByIdHandler,
  updateTicketHandler,
} from './support.controller.js';

/** Roles permitted to update support tickets. */
const UPDATE_ROLES = [Role.SUPER_ADMIN, Role.ACADEMIC_AFFAIRS, Role.HOD] as const;

/**
 * Registers all support ticket routes on the provided Fastify instance.
 *
 * @param app - The Fastify application instance to register routes on.
 * @returns A promise that resolves once all routes have been registered.
 */
export async function registerSupportRoutes(app: FastifyInstance): Promise<void> {
  // ── POST /support ────────────────────────────────────────────────────────
  app.post(
    '/support',
    {
      preHandler: [authenticate],
      schema: {
        tags: ['support'],
        summary: 'Create a new support ticket',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['category', 'subject', 'description'],
          properties: {
            category: { type: 'string' },
            subject: { type: 'string', minLength: 5, maxLength: 200 },
            description: { type: 'string', minLength: 20 },
          },
        },
        response: { 201: { type: 'object', additionalProperties: true } },
      },
    },
    createTicketHandler,
  );

  // ── GET /support ─────────────────────────────────────────────────────────
  app.get(
    '/support',
    {
      preHandler: [authenticate],
      schema: {
        tags: ['support'],
        summary: 'List support tickets (scope-aware)',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            category: { type: 'string' },
            page: { type: 'integer', minimum: 1, default: 1 },
            pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          },
        },
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    listTicketsHandler,
  );

  // ── PATCH /support/:id ───────────────────────────────────────────────────
  app.patch(
    '/support/:id',
    {
      preHandler: [authenticate, requireRoles(...UPDATE_ROLES)],
      schema: {
        tags: ['support'],
        summary: 'Update a support ticket status or assignment',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        body: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            assignedRole: { type: 'string' },
            assignedToId: { type: 'string', format: 'uuid' },
            resolution: { type: 'string' },
          },
        },
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    updateTicketHandler,
  );

  // ── GET /support/:id ─────────────────────────────────────────────────────
  // Registered last to avoid matching action sub-paths as IDs
  app.get(
    '/support/:id',
    {
      preHandler: [authenticate],
      schema: {
        tags: ['support'],
        summary: 'Get a support ticket by ID',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    getTicketByIdHandler,
  );
}
