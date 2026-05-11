import Fastify from 'fastify';
import { type FastifyInstance } from 'fastify';
import { prisma } from './lib/prisma.js';
import { redis } from './lib/redis.js';
import { env } from './config/env.js';
import corsPlugin from './plugins/cors.js';
import helmetPlugin from './plugins/helmet.js';
import rateLimiterPlugin from './plugins/rate-limiter.js';
import swaggerPlugin from './plugins/swagger.js';

export async function createApp(): Promise<FastifyInstance> {
  const isDev = env.NODE_ENV === 'development';

  const app = Fastify({
    logger: isDev
      ? {
          level: 'debug',
          transport: {
            target: 'pino-pretty',
            options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' },
          },
        }
      : { level: 'info' },
  });

  // ── Plugins ──────────────────────────────────────────────────────────────
  await app.register(helmetPlugin);
  await app.register(corsPlugin);
  await app.register(rateLimiterPlugin);
  await app.register(swaggerPlugin);

  // ── Health check (public — no auth required) ─────────────────────────────
  app.get(
    '/health',
    {
      schema: {
        tags: ['system'],
        summary: 'Health check',
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              db: { type: 'string' },
              redis: { type: 'string' },
              timestamp: { type: 'string' },
            },
          },
          503: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              db: { type: 'string' },
              redis: { type: 'string' },
              timestamp: { type: 'string' },
            },
          },
        },
      },
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    },
    async (_request, reply) => {
      let dbStatus = 'connected';
      let redisStatus = 'connected';

      try {
        await prisma.$queryRaw`SELECT 1`;
      } catch {
        dbStatus = 'disconnected';
      }

      try {
        await redis.ping();
      } catch {
        redisStatus = 'disconnected';
      }

      const isHealthy = dbStatus === 'connected' && redisStatus === 'connected';
      const statusCode = isHealthy ? 200 : 503;

      return reply.status(statusCode).send({
        status: isHealthy ? 'ok' : 'degraded',
        db: dbStatus,
        redis: redisStatus,
        timestamp: new Date().toISOString(),
      });
    },
  );

  // ── Global error handler (placeholder — Phase 09 implements fully) ────────
  app.setErrorHandler((error, _request, reply) => {
    app.log.error(error);
    const fastifyError = error as { statusCode?: number; message: string };
    const statusCode = fastifyError.statusCode ?? 500;
    void reply.status(statusCode).send({
      statusCode,
      error: 'INTERNAL_SERVER_ERROR',
      message: fastifyError.message,
    });
  });

  return app;
}
