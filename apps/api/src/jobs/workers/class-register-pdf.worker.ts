/**
 * @file class-register-pdf.worker.ts
 * @module jobs/workers
 *
 * BullMQ worker for class register PDF generation.
 *
 * Generates a traditional-format attendance register PDF for a course section
 * (all sessions × all students with status). Signs with SHA-256 checksum,
 * uploads to S3, and notifies the lecturer and HOD.
 *
 * Phase 28 implements the full PDF generation logic. This worker provides
 * the BullMQ infrastructure and a stub implementation.
 */

import { Worker, type Job } from 'bullmq';
import { redis } from '../../lib/redis.js';
import { type ClassRegisterJobData } from '../queue.js';

/**
 * Processes a single `class-register-pdf` job.
 *
 * Stub implementation — full PDF generation is implemented in Phase 28.
 *
 * @param job - BullMQ job containing {@link ClassRegisterJobData}.
 * @returns A promise that resolves once the PDF is generated and uploaded.
 */
export async function processClassRegisterPdf(job: Job<ClassRegisterJobData>): Promise<void> {
  const { courseSectionId, semesterId } = job.data;
  // Phase 28: generate PDF, sign with SHA-256, upload to S3, notify lecturer/HOD
  console.info(
    `[class-register-pdf] Stub: courseSectionId=${courseSectionId} semesterId=${semesterId}`,
  );
}

/**
 * BullMQ worker instance for the `class-register-pdf` queue.
 *
 * Concurrency 2 — PDF generation is I/O bound.
 */
export const classRegisterPdfWorker = new Worker<ClassRegisterJobData>(
  'class-register-pdf',
  processClassRegisterPdf,
  { connection: redis, concurrency: 2 },
);

classRegisterPdfWorker.on('failed', (job, err) => {
  console.error(`[class-register-pdf] Job ${job?.id ?? 'unknown'} failed:`, err.message);
});
