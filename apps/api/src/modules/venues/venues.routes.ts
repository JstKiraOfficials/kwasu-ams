/**
 * @file venues.routes.ts
 * @module modules/venues
 *
 * Fastify route registrations for the venues module.
 *
 * | Method | Path          | Roles allowed                                         |
 * |--------|---------------|-------------------------------------------------------|
 * | GET    | /venues       | SUPER_ADMIN, ACADEMIC_AFFAIRS, DEAN, HOD, LECTURER    |
 * | GET    | /venues/:id   | SUPER_ADMIN, ACADEMIC_AFFAIRS, DEAN, HOD, LECTURER    |
 * | POST   | /venues       | SUPER_ADMIN, ACADEMIC_AFFAIRS                         |
 * | PATCH  | /venues/:id   | SUPER_ADMIN, ACADEMIC_AFFAIRS                         |
 * | DELETE | /venues/:id   | SUPER_ADMIN only (soft deactivation)                  |
 */

import { type FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRoles } from '../../middleware/role-guard.js';
import { Role } from '@kwasu-ams/types';
import * as controller from './venues.controller.js';

/** Roles permitted to read venue data. */
const READ_ROLES = [
  Role.SUPER_ADMIN,
  Role.ACADEMIC_AFFAIRS,
  Role.DEAN,
  Role.HOD,
  Role.LECTURER,
] as const;

/** Roles permitted to create and update venues. */
const MANAGE_ROLES = [Role.SUPER_ADMIN, Role.ACADEMIC_AFFAIRS] as const;

/**
 * Registers all venue routes on the provided Fastify instance.
 *
 * Called from `app.ts` via `app.register(registerVenueRoutes)`.
 *
 * @param app - The Fastify application instance to register routes on.
 * @returns A promise that resolves once all routes have been registered.
 */
export async function registerVenueRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /venues ─────────────────────────────────────────────────────────
  app.get(
    '/venues',
    {
      preHandler: [authenticate, requireRoles(...READ_ROLES)],
      schema: {
        tags: ['venues'],
        summary: 'List venues',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            buildingName: { type: 'string' },
            isActive: { type: 'boolean' },
            page: { type: 'integer', minimum: 1, default: 1 },
            pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          },
        },
        response: { 200: { type: 'object' } },
      },
    },
    controller.listVenuesHandler,
  );

  // ── GET /venues/:id ──────────────────────────────────────────────────────
  app.get(
    '/venues/:id',
    {
      preHandler: [authenticate, requireRoles(...READ_ROLES)],
      schema: {
        tags: ['venues'],
        summary: 'Get a venue by ID',
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
    controller.getVenueByIdHandler,
  );

  // ── POST /venues ─────────────────────────────────────────────────────────
  app.post(
    '/venues',
    {
      preHandler: [authenticate, requireRoles(...MANAGE_ROLES)],
      schema: {
        tags: ['venues'],
        summary: 'Create a new venue',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['name', 'buildingName', 'latitude', 'longitude', 'capacity'],
          properties: {
            name: { type: 'string', minLength: 2 },
            buildingName: { type: 'string', minLength: 2 },
            latitude: { type: 'number', minimum: -90, maximum: 90 },
            longitude: { type: 'number', minimum: -180, maximum: 180 },
            geofenceRadius: { type: 'integer', minimum: 30, maximum: 150, default: 50 },
            capacity: { type: 'integer', minimum: 1 },
          },
        },
        response: {
          201: { type: 'object' },
          400: { type: 'object' },
          403: { type: 'object' },
        },
      },
    },
    controller.createVenueHandler,
  );

  // ── PATCH /venues/:id ────────────────────────────────────────────────────
  app.patch(
    '/venues/:id',
    {
      preHandler: [authenticate, requireRoles(...MANAGE_ROLES)],
      schema: {
        tags: ['venues'],
        summary: 'Update a venue',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        body: {
          type: 'object',
          properties: {
            name: { type: 'string', minLength: 2 },
            buildingName: { type: 'string', minLength: 2 },
            latitude: { type: 'number', minimum: -90, maximum: 90 },
            longitude: { type: 'number', minimum: -180, maximum: 180 },
            geofenceRadius: { type: 'integer', minimum: 30, maximum: 150 },
            capacity: { type: 'integer', minimum: 1 },
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
    controller.updateVenueHandler,
  );

  // ── DELETE /venues/:id ───────────────────────────────────────────────────
  app.delete(
    '/venues/:id',
    {
      preHandler: [authenticate, requireRoles(Role.SUPER_ADMIN)],
      schema: {
        tags: ['venues'],
        summary: 'Deactivate a venue (soft delete — SUPER_ADMIN only)',
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
    controller.deactivateVenueHandler,
  );
}
