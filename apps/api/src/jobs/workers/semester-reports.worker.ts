/**
 * @file semester-reports.worker.ts
 * @module jobs/workers
 *
 * BullMQ worker for end-of-semester report generation.
 *
 * Triggers eligibility computation, then enqueues class-register-pdf and
 * student-report-card sub-jobs in rate-limited batches of 50 per second to
 * avoid flooding the queue with thousands of simultaneous jobs.
 */

import { Worker, type Job } from 'bullmq';
import { redis } from '../../lib/redis.js';
import { prisma } from '../../lib/prisma.js';
import { computeEligibilityForSemester } from '../../modules/eligibility/eligibility.service.js';
import { classRegisterQueue, reportCardQueue, type SemesterReportsJobData } from '../queue.js';

/** Batch size for sub-job enqueuing (jobs per second). */
const BATCH_SIZE = 50;

/**
 * Splits an array into chunks of the given size.
 *
 * @param arr  - Array to chunk.
 * @param size - Maximum chunk size.
 * @returns Array of chunks.
 */
function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/**
 * Processes a single `semester-reports` job.
 *
 * @param job - BullMQ job containing {@link SemesterReportsJobData}.
 * @returns A promise that resolves once all sub-jobs are enqueued.
 */
export async function processSemesterReports(job: Job<SemesterReportsJobData>): Promise<void> {
  const { semesterId } = job.data;

  // Step 1: Trigger eligibility computation
  await computeEligibilityForSemester(semesterId);

  // Step 2: Enqueue class register PDFs for all course sections
  const sections = await prisma.courseSection.findMany({
    where: { semesterId },
    select: { id: true },
  });

  const registerJobs = sections.map((s) => ({
    name: 'generate',
    data: { courseSectionId: s.id, semesterId },
  }));

  for (const batch of chunkArray(registerJobs, BATCH_SIZE)) {
    await classRegisterQueue.addBulk(batch);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  // Step 3: Enqueue student report cards
  const students = await prisma.student.findMany({
    where: { enrollments: { some: { courseSection: { semesterId } } } },
    select: { id: true },
  });

  const reportCardJobs = students.map((s) => ({
    name: 'generate',
    data: { studentId: s.id, semesterId },
  }));

  for (const batch of chunkArray(reportCardJobs, BATCH_SIZE)) {
    await reportCardQueue.addBulk(batch);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  console.info(
    `[semester-reports] Enqueued ${registerJobs.length} register PDFs and ${reportCardJobs.length} report cards`,
  );
}

/**
 * BullMQ worker instance for the `semester-reports` queue.
 *
 * Concurrency 1 — orchestration job, not CPU-intensive itself.
 */
export const semesterReportsWorker = new Worker<SemesterReportsJobData>(
  'semester-reports',
  processSemesterReports,
  { connection: redis, concurrency: 1 },
);

semesterReportsWorker.on('failed', (job, err) => {
  console.error(`[semester-reports] Job ${job?.id ?? 'unknown'} failed:`, err.message);
});
