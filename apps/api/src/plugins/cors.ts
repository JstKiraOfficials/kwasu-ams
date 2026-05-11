/**
 * @file cors.ts
 * @module plugins
 *
 * Registers `@fastify/cors` with an allowlist of origins read from the
 * `CORS_ORIGINS` environment variable (comma-separated).
 *
 * In production, `CORS_ORIGINS` must be set to the exact domain(s) — never `*`.
 * Credentials (cookies, Authorization headers) are allowed on all origins.
 */

import fp from 'fastify-plugin';
import cors from '@fastify/cors';
import { type FastifyInstance } from 'fastify';
import { env } from '../config/env.js';

/**
 * Fastify plugin that registers CORS with the configured allowed origins.
 *
 * @param app - The Fastify application instance to register the plugin on.
 */
export default fp(async function corsPlugin(app: FastifyInstance): Promise<void> {
  const allowedOrigins = env.CORS_ORIGINS.split(',').map((s) => s.trim());

  await app.register(cors, {
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
});
