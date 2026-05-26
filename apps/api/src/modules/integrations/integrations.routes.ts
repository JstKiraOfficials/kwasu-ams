/**
 * @file integrations.routes.ts
 * @module modules/integrations
 *
 * Placeholder Fastify plugin for future integration endpoints.
 *
 * No routes are registered here in v1.0. Full implementation depends on
 * external system APIs from KWASU IT department (see README.md).
 */

import { type FastifyInstance } from 'fastify';

/**
 * Registers integration routes on the provided Fastify instance.
 *
 * Currently a no-op stub. External integration routes will be added here
 * once KWASU IT provides API specifications for SSO, RMS, Moodle, and Bursary.
 *
 * @param _app - The Fastify application instance (unused in stub).
 * @returns A promise that resolves immediately.
 */
export async function registerIntegrationRoutes(_app: FastifyInstance): Promise<void> {
  // Stub — no routes registered in v1.0
}
