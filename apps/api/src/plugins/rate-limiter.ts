/**
 * @file rate-limiter.ts
 * @module plugins
 *
 * Registers `@fastify/rate-limit` with Redis as the shared store.
 *
 * Global limit: 200 requests per minute per IP.
 * Auth routes override this to 5 requests per minute (configured per-route).
 *
 * Using Redis as the store ensures rate limits are shared across all API
 * instances in a horizontally-scaled deployment.
 */

import fp from 'fastify-plugin';
import rateLimit from '@fastify/rate-limit';
import { type FastifyInstance } from 'fastify';
import { redis } from '../lib/redis.js';

/**
 * Fastify plugin that registers global rate limiting backed by Redis.
 *
 * @param app - The Fastify application instance to register the plugin on.
 */
export default fp(async function rateLimiterPlugin(app: FastifyInstance): Promise<void> {
  await app.register(rateLimit, {
    global: true,
    max: 200,
    timeWindow: '1 minute',
    redis,
    keyGenerator: (request) => request.headers['x-forwarded-for']?.toString() ?? request.ip,
    errorResponseBuilder: (_request, context) => ({
      statusCode: 429,
      error: 'RATE_LIMIT_EXCEEDED',
      message: `Too many requests. Retry after ${String(context.after)}.`,
    }),
  });
});
