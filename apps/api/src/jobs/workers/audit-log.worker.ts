/**
 * @file audit-log.worker.ts
 * @module jobs/workers
 *
 * BullMQ worker for asynchronous audit log writes.
 *
 * Processes `audit-log` jobs by writing `AuditLog` records to the database.
 * Uses 0 retries — if a write fails, the error is logged and the job is
 * discarded. Audit log failure must never block the application or retry
 * indefinitely.
 *
 * Security-critical audit events (login, lockout, password change, TOTP
 * enroll/reset, account creation/deletion, data export) must NOT use this
 * queue — they must remain as synchronous `prisma.auditLog.create()` calls
 * inside the same transaction as the state change.
 */

import { Worker, type Job } from 'bullmq';
import { workerRedis } from '../../lib/redis.js';
import { prisma } from '../../lib/prisma.js';
import { type AuditLogJobData } from '../queue.js';

/**
 * Processes a single `audit-log` job by writing an `AuditLog` record.
 *
 * @param job - BullMQ job containing {@link AuditLogJobData}.
 * @returns A promise that resolves once the record is written.
 */
export async function processAuditLog(job: Job<AuditLogJobData>): Promise<void> {
  const {
    actorId,
    actorRole,
    action,
    entityType,
    entityId,
    beforeJson,
    afterJson,
    ipAddress,
    metadata,
  } = job.data;

  await prisma.auditLog.create({
    data: {
      actorId,
      actorRole: actorRole as never,
      action: action as never,
      entityType,
      entityId: entityId ?? null,
      beforeJson: (beforeJson ?? null) as never,
      afterJson: (afterJson ?? null) as never,
      ipAddress: ipAddress ?? null,
      metadata: (metadata ?? null) as never,
    },
  });
}

/**
 * BullMQ worker instance for the `audit-log` queue.
 *
 * Concurrency 5 — audit log writes are fast DB inserts.
 * 0 retries — failures are logged and discarded.
 */
export const auditLogWorker = new Worker<AuditLogJobData>('audit-log', processAuditLog, {
  connection: workerRedis,
  concurrency: 5,
});

auditLogWorker.on('failed', (job, err) => {
  console.error(`[audit-log] Job ${job?.id ?? 'unknown'} failed:`, err.message);
});
