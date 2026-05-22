/**
 * @file queue.ts
 * @module jobs
 *
 * BullMQ queue definitions for KWASU AMS background jobs.
 *
 * This file is expanded incrementally across phases:
 * - Phase 22: `anomaly-detection` queue
 * - Phase 24: `eligibility-computation` queue
 * Phase 27 consolidates all remaining queue definitions.
 *
 * All queues share the same ioredis connection singleton from `lib/redis.ts`.
 * The connection is passed by reference — BullMQ does not close it.
 */

import { Queue } from 'bullmq';
import { redis } from '../lib/redis.js';

// =============================================================================
// Typed job data interfaces
// =============================================================================

/**
 * Payload for an `anomaly-detection` job.
 *
 * Enqueued by `closeSession()` with a 5-second delay to ensure all
 * attendance records are committed before the worker reads them.
 */
export interface AnomalyDetectionJobData {
  /** UUID of the `CourseSession` to run anomaly detection against. */
  sessionId: string;
}

// =============================================================================
// Queue instances
// =============================================================================

/**
 * BullMQ queue for post-session anomaly detection jobs.
 *
 * Jobs are enqueued by `closeSession()` in `session-lifecycle.service.ts`
 * with a 5-second delay and processed by `anomaly-detection.worker.ts`.
 *
 * Retry policy: 3 attempts with exponential backoff (configured on the worker).
 */
export const anomalyDetectionQueue = new Queue<AnomalyDetectionJobData>('anomaly-detection', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
});

/**
 * Payload for an `eligibility-computation` job.
 *
 * Enqueued by `triggerEligibilityComputation()` in `eligibility.service.ts`
 * and by the BullMQ scheduler on `semester.eligibilityComputeDate` (Phase 27).
 */
export interface EligibilityComputationJobData {
  /** UUID of the `Semester` to compute eligibility for. */
  semesterId: string;
}

/**
 * BullMQ queue for eligibility computation jobs.
 *
 * Jobs are enqueued manually via `POST /eligibility/compute` or automatically
 * by the Phase 27 scheduler on `semester.eligibilityComputeDate`.
 *
 * Retry policy: 3 attempts with exponential backoff (configured on the queue).
 */
export const eligibilityComputationQueue = new Queue<EligibilityComputationJobData>(
  'eligibility-computation',
  {
    connection: redis,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 25 },
    },
  },
);
