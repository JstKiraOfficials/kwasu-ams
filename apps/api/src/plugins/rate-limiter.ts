import fp from 'fastify-plugin';
import rateLimit from '@fastify/rate-limit';
import { type FastifyInstance } from 'fastify';
import { redis } from '../lib/redis.js';

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
