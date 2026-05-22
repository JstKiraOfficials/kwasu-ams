/**
 * @file student-report-card.worker.ts
 * @module jobs/workers
 *
 * BullMQ worker for student report card PDF generation.
 *
 * Generates a per-student report card PDF (final % per course, eligibility
 * outcome, approved excuses, trend vs previous semester). Uploads to S3 and
 * notifies the student via push + email.
 *
 * Phase 28 implements the full PDF generation logic. This worker provides
 * the BullMQ infrastructure and a stub implementation.
 */

import { Worker, type Job } from 'bullmq';
import { redis } from '../../lib/redis.js';
import { type ReportCardJobData } from '../queue.js';

/**
 * Processes a single `student-report-card` job.
 *
 * Stub implementation — full PDF generation is implemented in Phase 28.
 *
 * @param job - BullMQ job containing {@link ReportCardJobData}.
 * @returns A promise that resolves once the report card is generated and uploaded.
 */
export async function processStudentReportCard(job: Job<ReportCardJobData>): Promise<void> {
  const { studentId, semesterId } = job.data;
  // Phase 28: generate PDF, upload to S3, notify student
  console.info(`[student-report-card] Stub: studentId=${studentId} semesterId=${semesterId}`);
}

/**
 * BullMQ worker instance for the `student-report-card` queue.
 *
 * Concurrency 2 — PDF generation is I/O bound.
 */
export const studentReportCardWorker = new Worker<ReportCardJobData>(
  'student-report-card',
  processStudentReportCard,
  { connection: redis, concurrency: 2 },
);

studentReportCardWorker.on('failed', (job, err) => {
  console.error(`[student-report-card] Job ${job?.id ?? 'unknown'} failed:`, err.message);
});
