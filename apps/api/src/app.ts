/**
 * @file app.ts
 * @module api
 *
 * Fastify application factory for KWASU AMS API.
 *
 * Assembles the full application by registering plugins, module routes, and
 * the global error handler in the correct order:
 *
 * 1. Security plugins: Helmet → CORS → Rate limiter
 * 2. Documentation: Swagger (dev only)
 * 3. System routes: GET /health
 * 4. Module routes: /auth/*, /admin/*
 * 5. Global error handler
 *
 * The factory pattern (rather than a module-level singleton) makes the app
 * fully testable — each test can create a fresh instance via `createApp()`.
 */

import Fastify from 'fastify';
import { type FastifyInstance } from 'fastify';
import { prisma } from './lib/prisma.js';
import { redis } from './lib/redis.js';
import { env } from './config/env.js';
import corsPlugin from './plugins/cors.js';
import helmetPlugin from './plugins/helmet.js';
import rateLimiterPlugin from './plugins/rate-limiter.js';
import swaggerPlugin from './plugins/swagger.js';
import multipartPlugin from './plugins/multipart.js';
import websocketPlugin from '@fastify/websocket';
import { errorHandler } from './middleware/error-handler.js';
import { registerAuthRoutes } from './modules/auth/auth.routes.js';
import { registerAdminRoutes } from './modules/admin/admin.routes.js';
import { registerFacultyRoutes } from './modules/faculties/faculties.routes.js';
import { registerDepartmentRoutes } from './modules/departments/departments.routes.js';
import { registerProgrammeRoutes } from './modules/programmes/programmes.routes.js';
import { registerCourseRoutes } from './modules/courses/courses.routes.js';
import { registerVenueRoutes } from './modules/venues/venues.routes.js';
import { registerTimetableRoutes } from './modules/timetable/timetable.routes.js';
import { registerStudentRoutes } from './modules/students/students.routes.js';
import { registerLecturerRoutes } from './modules/lecturers/lecturers.routes.js';
import { registerDeviceRoutes } from './modules/devices/devices.routes.js';
import { registerAnomalyRoutes } from './modules/anomalies/anomalies.routes.js';
import { registerSessionRoutes } from './modules/sessions/sessions.routes.js';
import { registerAttendanceRoutes } from './modules/attendance/attendance.routes.js';
import { registerExcuseRoutes } from './modules/excuses/excuses.routes.js';
import { registerEligibilityRoutes } from './modules/eligibility/eligibility.routes.js';
import { registerNotificationRoutes } from './modules/notifications/notifications.routes.js';
import { registerAnalyticsRoutes } from './modules/analytics/analytics.routes.js';
import { registerWebSocketRoutes } from './websocket/index.js';

/**
 * Creates and configures the Fastify application instance.
 *
 * Registers all plugins, routes, and the global error handler. Does **not**
 * bind to a port — call `app.listen()` in `index.ts` after this returns.
 *
 * @returns A fully configured Fastify instance ready to listen or inject.
 */
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
  await app.register(multipartPlugin);
  await app.register(websocketPlugin);

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

  // ── Module routes ─────────────────────────────────────────────────────────
  await app.register(registerAuthRoutes);
  await app.register(registerAdminRoutes);
  await app.register(registerFacultyRoutes);
  await app.register(registerDepartmentRoutes);
  await app.register(registerProgrammeRoutes);
  await app.register(registerCourseRoutes);
  await app.register(registerVenueRoutes);
  await app.register(registerTimetableRoutes);
  await app.register(registerStudentRoutes);
  await app.register(registerLecturerRoutes);
  await app.register(registerDeviceRoutes);
  await app.register(registerAnomalyRoutes);
  await app.register(registerSessionRoutes);
  await app.register(registerAttendanceRoutes);
  await app.register(registerExcuseRoutes);
  await app.register(registerEligibilityRoutes);
  await app.register(registerNotificationRoutes);
  await app.register(registerAnalyticsRoutes);
  registerWebSocketRoutes(app);

  // ── Global error handler ──────────────────────────────────────────────────
  app.setErrorHandler(errorHandler);

  return app;
}
