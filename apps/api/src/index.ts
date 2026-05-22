/**
 * @file index.ts
 * @module api
 *
 * Application entry point for the KWASU AMS API server.
 *
 * Responsibilities:
 * 1. Loads `.env` into `process.env` before any other module is imported,
 *    ensuring `t3-env` validation in `config/env.ts` has access to all variables.
 * 2. Connects to Redis.
 * 3. Creates and starts the Fastify application.
 * 4. Registers graceful shutdown handlers for SIGTERM and SIGINT.
 */

// ── Load .env FIRST — must be before any other import that reads process.env ──
import 'dotenv/config';

import { createApp } from './app.js';
import { connectRedis, redis } from './lib/redis.js';
import { prisma } from './lib/prisma.js';
import { env } from './config/env.js';

// ── BullMQ workers (registered at startup) ───────────────────────────────────
import './jobs/workers/audit-log.worker.js';
import './jobs/workers/notification-dispatch.worker.js';
import './jobs/workers/anomaly-detection.worker.js';
import './jobs/workers/eligibility-computation.worker.js';
import './jobs/workers/early-intervention.worker.js';
import './jobs/workers/lecturer-accountability.worker.js';
import './jobs/workers/welfare-check.worker.js';
import './jobs/workers/weekly-summary.worker.js';
import './jobs/workers/semester-reports.worker.js';
import './jobs/workers/class-register-pdf.worker.js';
import './jobs/workers/student-report-card.worker.js';
import './jobs/workers/bulk-account-creation.worker.js';

// ── BullMQ schedulers ─────────────────────────────────────────────────────────
import { registerWeeklySchedulers } from './jobs/schedulers/weekly-scheduler.js';
import { registerSemesterEndScheduler } from './jobs/schedulers/semester-end-scheduler.js';

// ── BullMQ workers (registered at startup) ───────────────────────────────────
import './jobs/workers/audit-log.worker.js';
import './jobs/workers/notification-dispatch.worker.js';
import './jobs/workers/anomaly-detection.worker.js';
import './jobs/workers/eligibility-computation.worker.js';
import './jobs/workers/early-intervention.worker.js';
import './jobs/workers/lecturer-accountability.worker.js';
import './jobs/workers/welfare-check.worker.js';
import './jobs/workers/weekly-summary.worker.js';
import './jobs/workers/semester-reports.worker.js';
import './jobs/workers/class-register-pdf.worker.js';
import './jobs/workers/student-report-card.worker.js';
import './jobs/workers/bulk-account-creation.worker.js';

// ── BullMQ schedulers ─────────────────────────────────────────────────────────
import { registerWeeklySchedulers } from './jobs/schedulers/weekly-scheduler.js';
import { registerSemesterEndScheduler } from './jobs/schedulers/semester-end-scheduler.js';

/**
 * Bootstraps the API server: connects Redis, starts Fastify, and registers
 * graceful shutdown handlers.
 */
async function main(): Promise<void> {
  // Connect to Redis before starting the server
  await connectRedis();

  // Register BullMQ schedulers
  await registerWeeklySchedulers();
  await registerSemesterEndScheduler();

  // Register BullMQ schedulers
  await registerWeeklySchedulers();
  await registerSemesterEndScheduler();

  const app = await createApp();

  // Start listening on all interfaces
  await app.listen({ port: env.API_PORT, host: '0.0.0.0' });
  app.log.info(`KWASU AMS API running on port ${env.API_PORT}`);

  // ── Graceful shutdown ─────────────────────────────────────────────────────

  /**
   * Closes all connections cleanly before the process exits.
   * @param signal - The OS signal that triggered the shutdown (SIGTERM or SIGINT).
   */
  const shutdown = async (signal: string): Promise<void> => {
    app.log.info(`Received ${signal} — shutting down gracefully`);
    try {
      await app.close();
      await prisma.$disconnect();
      await redis.quit();
      app.log.info('Shutdown complete');
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
