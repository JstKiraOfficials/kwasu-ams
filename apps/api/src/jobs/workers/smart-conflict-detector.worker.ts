/**
 * @file smart-conflict-detector.worker.ts
 * @module jobs/workers
 *
 * BullMQ worker for the `smart-conflict-detection` queue.
 *
 * Runs weekly (Monday 09:00 Nigeria time). Delegates to
 * `detectTimetableConflicts()` from the smart conflict detector service.
 *
 * No attendance records or eligibility records are modified — this worker is
 * advisory only. Output: `REPEATED_DAY_PATTERN` anomaly flags for ACADEMIC_AFFAIRS review.
 */

import { Worker, type Job } from 'bullmq';
import { redis } from '../../lib/redis.js';
import { type SmartConflictDetectionJobData } from '../queue.js';
import { detectTimetableConflicts } from '../../modules/timetable/smart-conflict-detector.service.js';

/**
 * Processes a single `smart-conflict-detection` job.
 *
 * @param job - BullMQ job containing {@link SmartConflictDetectionJobData}.
 * @returns A promise that resolves once all conflict flags are written.
 */
export async function processSmartConflictDetection(
  job: Job<SmartConflictDetectionJobData>,
): Promise<void> {
  const { semesterId } = job.data;
  await detectTimetableConflicts(semesterId);
}

/**
 * BullMQ worker instance for the `smart-conflict-detection` queue.
 *
 * Concurrency 1 — runs weekly; the full scan is sequential per student to
 * avoid overwhelming the database.
 */
export const smartConflictDetectorWorker = new Worker<SmartConflictDetectionJobData>(
  'smart-conflict-detection',
  processSmartConflictDetection,
  { connection: redis, concurrency: 1 },
);

smartConflictDetectorWorker.on('failed', (job, err) => {
  console.error(
    `[smart-conflict-detector] Job ${job?.id ?? 'unknown'} failed for semester ${job?.data.semesterId ?? 'unknown'}:`,
    err.message,
  );
});
