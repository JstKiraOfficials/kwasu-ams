/**
 * @file eligibility-computation.worker.ts
 * @module jobs/workers
 *
 * BullMQ worker for eligibility computation jobs.
 *
 * Processes `eligibility-computation` jobs by calling
 * `computeEligibilityForSemester()`. After computation, enqueues
 * `EXAM_BAR` notifications for BARRED students and `ELIGIBILITY_CONFIRMED`
 * notifications for ELIGIBLE students.
 */

import { Worker, type Job } from 'bullmq';
import { redis } from '../../lib/redis.js';
import { prisma } from '../../lib/prisma.js';
import { computeEligibilityForSemester } from '../../modules/eligibility/eligibility.service.js';
import { notificationQueue, type EligibilityComputationJobData } from '../queue.js';

/**
 * Processes a single `eligibility-computation` job.
 *
 * Computes eligibility for all enrollments in the semester, then enqueues
 * notifications for BARRED and ELIGIBLE students.
 *
 * @param job - BullMQ job containing {@link EligibilityComputationJobData}.
 * @returns A promise that resolves once computation and notifications are queued.
 */
export async function processEligibilityComputation(
  job: Job<EligibilityComputationJobData>,
): Promise<void> {
  const { semesterId } = job.data;

  const { computed, errors } = await computeEligibilityForSemester(semesterId);
  console.info(
    `[eligibility-computation] Computed ${computed} records, ${errors} errors for semester ${semesterId}`,
  );

  // Enqueue notifications for BARRED students
  const barredRecords = await prisma.examEligibility.findMany({
    where: { semesterId, status: 'BARRED' },
    include: {
      student: {
        include: {
          user: { select: { id: true } },
          enrollments: {
            where: { courseSection: { semesterId } },
            include: { courseSection: { include: { course: { select: { code: true } } } } },
            take: 1,
          },
        },
      },
    },
  });

  for (const record of barredRecords) {
    const courseCode = record.student.enrollments[0]?.courseSection.course.code ?? 'N/A';
    void notificationQueue.add('dispatch', {
      recipientId: record.student.user.id,
      trigger: 'EXAM_BAR',
      data: { courseCode },
    });
  }

  // Enqueue notifications for ELIGIBLE students
  const eligibleRecords = await prisma.examEligibility.findMany({
    where: { semesterId, status: 'ELIGIBLE' },
    include: {
      student: {
        include: {
          user: { select: { id: true } },
          enrollments: {
            where: { courseSection: { semesterId } },
            include: { courseSection: { include: { course: { select: { code: true } } } } },
            take: 1,
          },
        },
      },
    },
  });

  for (const record of eligibleRecords) {
    const courseCode = record.student.enrollments[0]?.courseSection.course.code ?? 'N/A';
    void notificationQueue.add('dispatch', {
      recipientId: record.student.user.id,
      trigger: 'ELIGIBILITY_CONFIRMED',
      data: { courseCode, percentage: String(record.effectivePercentage) },
    });
  }
}

/**
 * BullMQ worker instance for the `eligibility-computation` queue.
 *
 * Concurrency 1 — computation is CPU/DB intensive.
 */
export const eligibilityComputationWorker = new Worker<EligibilityComputationJobData>(
  'eligibility-computation',
  processEligibilityComputation,
  { connection: redis, concurrency: 1 },
);

eligibilityComputationWorker.on('failed', (job, err) => {
  console.error(
    `[eligibility-computation] Job ${job?.id ?? 'unknown'} failed for semester ${job?.data.semesterId ?? 'unknown'}:`,
    err.message,
  );
});
