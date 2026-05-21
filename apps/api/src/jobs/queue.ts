/**
 * @file queue.ts
 * @module jobs
 *
 * BullMQ queue definitions for KWASU AMS background jobs.
 *
 * This is a Phase 22 stub containing only the `anomaly-detection` queue.
 * Phase 27 expands this file with all remaining queue definitions
 * (audit log, notifications, eligibility computation, etc.).
 *
 * All queues share the same ioredis connection singleton from `lib/redis.ts`.
 * The connection is passed by reference — BullMQ does not close it.
 *
 * Do not add additional queues here until Phase 27.
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
