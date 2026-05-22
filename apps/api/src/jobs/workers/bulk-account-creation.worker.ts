/**
 * @file bulk-account-creation.worker.ts
 * @module jobs/workers
 *
 * BullMQ worker for bulk account creation jobs.
 *
 * Processes `bulk-account-creation` jobs by calling the admin bulk import
 * service with the S3 CSV key. The CSV is downloaded from S3, parsed, and
 * user accounts are created in batches.
 *
 * Phase 29 implements the full bulk import service. This worker provides
 * the BullMQ infrastructure and delegates to the admin module.
 */

import { Worker, type Job } from 'bullmq';
import { redis } from '../../lib/redis.js';
import { type BulkAccountJobData } from '../queue.js';

/**
 * Processes a single `bulk-account-creation` job.
 *
 * Stub implementation — full bulk import is implemented in Phase 29.
 *
 * @param job - BullMQ job containing {@link BulkAccountJobData}.
 * @returns A promise that resolves once all accounts are created.
 */
export async function processBulkAccountCreation(job: Job<BulkAccountJobData>): Promise<void> {
  const { csvS3Key, actorId } = job.data;
  // Phase 29: download CSV from S3, parse, create accounts, send temp passwords
  console.info(`[bulk-account-creation] Stub: csvS3Key=${csvS3Key} actorId=${actorId}`);
}

/**
 * BullMQ worker instance for the `bulk-account-creation` queue.
 *
 * Concurrency 1 — bulk imports are sequential to avoid DB contention.
 */
export const bulkAccountCreationWorker = new Worker<BulkAccountJobData>(
  'bulk-account-creation',
  processBulkAccountCreation,
  { connection: redis, concurrency: 1 },
);

bulkAccountCreationWorker.on('failed', (job, err) => {
  console.error(`[bulk-account-creation] Job ${job?.id ?? 'unknown'} failed:`, err.message);
});
