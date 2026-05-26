/**
 * @file semester-end-scheduler.ts
 * @module jobs/schedulers
 *
 * BullMQ daily scheduler for semester-end background jobs.
 *
 * Checks daily whether:
 * 1. `semester.eligibilityComputeDate` has passed and eligibility has not yet
 *    been computed → enqueues `eligibility-computation` job.
 * 2. `semester.endDate` has passed → enqueues `semester-reports` job.
 *
 * Uses BullMQ's `repeat` option with a daily cron at 01:00 NST.
 */

import { eligibilityComputationQueue, semesterReportsQueue } from '../queue.js';
import { prisma } from '../../lib/prisma.js';

/** Nigeria Standard Time timezone identifier. */
const NST_TZ = 'Africa/Lagos';

/**
 * Checks semester dates and enqueues jobs if thresholds have been crossed.
 *
 * Called by the daily cron job. Idempotent — BullMQ deduplicates jobs with
 * the same `jobId`.
 *
 * @returns A promise that resolves once all necessary jobs are enqueued.
 */
export async function checkSemesterEndTriggers(): Promise<void> {
  const now = new Date();

  const activeSemester = await prisma.semester.findFirst({
    where: { isActive: true },
    select: {
      id: true,
      eligibilityComputeDate: true,
      endDate: true,
    },
  });

  if (!activeSemester) return;

  const { id: semesterId, eligibilityComputeDate, endDate } = activeSemester;

  // Check if eligibility computation should be triggered
  if (eligibilityComputeDate !== null && now >= eligibilityComputeDate) {
    await eligibilityComputationQueue.add(
      'scheduled-compute',
      { semesterId },
      {
        jobId: `eligibility-compute-${semesterId}-${eligibilityComputeDate.toISOString().split('T')[0]}`,
      },
    );
    console.info(
      `[semester-end-scheduler] Enqueued eligibility computation for semester ${semesterId}`,
    );
  }

  // Check if semester has ended and reports should be generated
  if (now >= endDate) {
    await semesterReportsQueue.add(
      'semester-reports',
      { semesterId },
      { jobId: `semester-reports-${semesterId}` },
    );
    console.info(`[semester-end-scheduler] Enqueued semester reports for semester ${semesterId}`);
  }
}

/**
 * Registers the daily semester-end check scheduler.
 *
 * Runs at 01:00 NST every day. Uses a stable `jobId` so BullMQ deduplicates
 * the recurring job on restart.
 *
 * @returns A promise that resolves once the scheduler is registered.
 */
export async function registerSemesterEndScheduler(): Promise<void> {
  // Register a daily job that calls checkSemesterEndTriggers
  // The actual check logic runs inside the worker that processes this job.
  // For simplicity, we enqueue a self-scheduling check job.
  await eligibilityComputationQueue.add(
    'daily-semester-check',
    { semesterId: 'CHECK_ONLY' }, // sentinel value — worker handles this specially
    {
      repeat: { pattern: '0 1 * * *', tz: NST_TZ },
      jobId: 'daily-semester-end-check',
    },
  );

  console.info('[semester-end-scheduler] Registered daily semester-end check');
}
