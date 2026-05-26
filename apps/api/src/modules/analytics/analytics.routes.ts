/**
 * @file analytics.routes.ts
 * @module modules/analytics
 *
 * Fastify route registrations for the analytics module.
 *
 * | Method | Path                                  | Roles                                          |
 * |--------|---------------------------------------|------------------------------------------------|
 * | GET    | /dashboard                            | authenticated (any role)                       |
 * | GET    | /analytics/course/:courseSectionId    | SUPER_ADMIN, ACADEMIC_AFFAIRS, DEAN, HOD, LECTURER |
 * | GET    | /analytics/student/:studentId         | SUPER_ADMIN…STUDENT                            |
 * | GET    | /analytics/heatmap/live               | SUPER_ADMIN, ACADEMIC_AFFAIRS, VICE_CHANCELLOR, DEAN |
 */

import { type FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRoles } from '../../middleware/role-guard.js';
import { Role } from '@kwasu-ams/types';
import {
  getDashboardHandler,
  getCourseAnalyticsHandler,
  getStudentAnalyticsHandler,
  getLiveHeatmapHandler,
} from './analytics.controller.js';

/** Roles permitted to read course analytics. */
const COURSE_ANALYTICS_ROLES = [
  Role.SUPER_ADMIN,
  Role.ACADEMIC_AFFAIRS,
  Role.DEAN,
  Role.HOD,
  Role.LECTURER,
] as const;

/** Roles permitted to read student analytics. */
const STUDENT_ANALYTICS_ROLES = [
  Role.SUPER_ADMIN,
  Role.ACADEMIC_AFFAIRS,
  Role.DEAN,
  Role.HOD,
  Role.LECTURER,
  Role.STUDENT,
] as const;

/** Roles permitted to view the live heatmap. */
const HEATMAP_ROLES = [
  Role.SUPER_ADMIN,
  Role.ACADEMIC_AFFAIRS,
  Role.VICE_CHANCELLOR,
  Role.DEAN,
] as const;

/**
 * Registers all analytics routes on the provided Fastify instance.
 *
 * @param app - The Fastify application instance to register routes on.
 * @returns A promise that resolves once all routes have been registered.
 */
export async function registerAnalyticsRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /dashboard ───────────────────────────────────────────────────────
  app.get(
    '/dashboard',
    {
      preHandler: [authenticate],
      schema: {
        tags: ['analytics'],
        summary: 'Get role-scoped dashboard data (cached 60s)',
        security: [{ bearerAuth: [] }],
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    getDashboardHandler,
  );

  // ── GET /analytics/course/:courseSectionId ───────────────────────────────
  app.get(
    '/analytics/course/:courseSectionId',
    {
      preHandler: [authenticate, requireRoles(...COURSE_ANALYTICS_ROLES)],
      schema: {
        tags: ['analytics'],
        summary: 'Get course-level analytics with trend and distribution',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['courseSectionId'],
          properties: { courseSectionId: { type: 'string', format: 'uuid' } },
        },
        querystring: {
          type: 'object',
          properties: { semesterId: { type: 'string', format: 'uuid' } },
        },
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    getCourseAnalyticsHandler,
  );

  // ── GET /analytics/student/:studentId ────────────────────────────────────
  app.get(
    '/analytics/student/:studentId',
    {
      preHandler: [authenticate, requireRoles(...STUDENT_ANALYTICS_ROLES)],
      schema: {
        tags: ['analytics'],
        summary: 'Get student-level analytics with dynamic messages and benchmarks',
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
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    getStudentAnalyticsHandler,
  );

  // ── GET /analytics/heatmap/live ──────────────────────────────────────────
  app.get(
    '/analytics/heatmap/live',
    {
      preHandler: [authenticate, requireRoles(...HEATMAP_ROLES)],
      schema: {
        tags: ['analytics'],
        summary: 'Get live venue check-in heatmap (cached 30s)',
        security: [{ bearerAuth: [] }],
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    getLiveHeatmapHandler,
  );
}
