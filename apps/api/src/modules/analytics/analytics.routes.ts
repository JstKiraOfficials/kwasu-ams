/**
 * @file analytics.routes.ts
 * @module modules/analytics
 *
 * Fastify route registrations for the analytics module.
 *
 * | Method | Path       | Roles            | Description                    |
 * |--------|------------|------------------|--------------------------------|
 * | GET    | /dashboard | authenticated    | Role-scoped dashboard data     |
 *
 * Phase 28 will add additional analytics endpoints (reports, exports).
 */

import { type FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate.js';
import { getDashboardHandler } from './analytics.controller.js';

/**
 * Registers all analytics routes on the provided Fastify instance.
 *
 * Called from `app.ts` via `app.register(registerAnalyticsRoutes)`.
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
}
