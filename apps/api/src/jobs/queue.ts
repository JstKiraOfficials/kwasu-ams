/**
 * @file queue.ts
 * @module jobs
 *
 * BullMQ queue definitions for all KWASU AMS background jobs.
 *
 * All queues share the same ioredis connection singleton from `lib/redis.ts`.
 * The connection is passed by reference — BullMQ does not close it.
 *
 * Retry policy (default for all queues except audit-log):
 * - 3 attempts with exponential backoff (1s, 2s, 4s).
 * - After 3 failures: job moves to the dead letter queue.
 *
 * Exception: `auditLogQueue` uses 0 retries — audit log failure must never
 * block the application or retry indefinitely.
 */

import { Queue, Worker } from 'bullmq';
import { workerRedis } from '../lib/redis.js';

// =============================================================================
// Shared default job options
// =============================================================================

/** Default retry policy for all queues except audit-log. */
const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 1000 },
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 50 },
};

// =============================================================================
// Job data interfaces
// =============================================================================

/**
 * Payload for an `audit-log` job.
 *
 * Non-security-critical audit events are written asynchronously via this queue.
 * Security-critical events (login, lockout, password change, TOTP, account
 * creation/deletion, data export) must remain as synchronous Prisma calls.
 */
export interface AuditLogJobData {
  /** UUID of the user performing the action. */
  actorId: string;
  /** Role string of the actor. */
  actorRole: string;
  /** AuditAction enum value string. */
  action: string;
  /** Human-readable entity name, e.g. `'AttendanceRecord'`. */
  entityType: string;
  /** Optional UUID of the affected entity. */
  entityId?: string;
  /** Optional snapshot of entity state before the change. */
  beforeJson?: unknown;
  /** Optional snapshot of entity state after the change. */
  afterJson?: unknown;
  /** Optional IP address of the request. */
  ipAddress?: string;
  /** Optional free-form context metadata. */
  metadata?: unknown;
}

/**
 * Payload for a `notification-dispatch` job.
 *
 * Enqueued by any module that needs to send a notification.
 */
export interface NotificationJobData {
  /** UUID of the `User` to notify. */
  recipientId: string;
  /** Notification trigger key. */
  trigger: string;
  /** Template data object. */
  data: Record<string, string>;
}

/**
 * Payload for an `anomaly-detection` job.
 *
 * Enqueued by `closeSession()` with a 5-second delay.
 */
export interface AnomalyDetectionJobData {
  /** UUID of the `CourseSession` to run anomaly detection against. */
  sessionId: string;
}

/**
 * Payload for an `eligibility-computation` job.
 *
 * Enqueued manually or by the semester-end scheduler.
 */
export interface EligibilityComputationJobData {
  /** UUID of the `Semester` to compute eligibility for. */
  semesterId: string;
}

/**
 * Payload for an `early-intervention` job.
 *
 * Enqueued weekly by the Monday scheduler.
 */
export interface EarlyInterventionJobData {
  /** UUID of the active `Semester`. */
  semesterId: string;
}

/**
 * Payload for a `lecturer-accountability` job.
 *
 * Enqueued weekly by the Monday scheduler.
 */
export interface AccountabilityJobData {
  /** UUID of the active `Semester`. */
  semesterId: string;
}

/**
 * Payload for a `welfare-check` job.
 *
 * Enqueued weekly by the Monday scheduler.
 */
export interface WelfareCheckJobData {
  /** UUID of the active `Semester`. */
  semesterId: string;
}

/**
 * Payload for a `weekly-summary` job.
 *
 * Enqueued weekly by the Monday scheduler.
 */
export interface WeeklySummaryJobData {
  /** UUID of the active `Semester`. */
  semesterId: string;
}

/**
 * Payload for a `semester-reports` job.
 *
 * Enqueued by the semester-end scheduler when `semester.endDate` passes.
 */
export interface SemesterReportsJobData {
  /** UUID of the `Semester` to generate reports for. */
  semesterId: string;
}

/**
 * Payload for a `class-register-pdf` job.
 *
 * Enqueued as a sub-job by the semester-reports worker.
 */
export interface ClassRegisterJobData {
  /** UUID of the `CourseSection`. */
  courseSectionId: string;
  /** UUID of the `Semester`. */
  semesterId: string;
}

/**
 * Payload for a `student-report-card` job.
 *
 * Enqueued as a sub-job by the semester-reports worker.
 */
export interface ReportCardJobData {
  /** UUID of the `Student` record. */
  studentId: string;
  /** UUID of the `Semester`. */
  semesterId: string;
}

/**
 * Payload for a `bulk-account-creation` job.
 *
 * Enqueued by the admin bulk import endpoint.
 */
export interface BulkAccountJobData {
  /** S3 object key of the uploaded CSV file. */
  csvS3Key: string;
  /** UUID of the admin user who triggered the import. */
  actorId: string;
}

// =============================================================================
// Queue instances
// =============================================================================

/**
 * BullMQ queue for asynchronous audit log writes.
 *
 * Uses 1 attempt (no retries) — audit log failure must never block the
 * application or retry indefinitely. Security-critical events (login, lockout,
 * password change, TOTP, account creation/deletion, data export) must use
 * synchronous `prisma.auditLog.create()` instead.
 */
export const auditLogQueue = new Queue<AuditLogJobData>('audit-log', {
  connection: workerRedis,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 100 },
  },
});

/**
 * BullMQ queue for notification dispatch jobs.
 *
 * Enqueued by any module that triggers a notification. Processed by
 * `notification-dispatch.worker.ts` which calls `dispatch()`.
 */
export const notificationQueue = new Queue<NotificationJobData>('notification-dispatch', {
  connection: workerRedis,
  defaultJobOptions: DEFAULT_JOB_OPTIONS,
});

/**
 * BullMQ queue for post-session anomaly detection jobs.
 *
 * Enqueued by `closeSession()` with a 5-second delay.
 */
export const anomalyDetectionQueue = new Queue<AnomalyDetectionJobData>('anomaly-detection', {
  connection: workerRedis,
  defaultJobOptions: DEFAULT_JOB_OPTIONS,
});

/**
 * BullMQ queue for eligibility computation jobs.
 *
 * Enqueued manually via `POST /eligibility/compute` or by the semester-end scheduler.
 */
export const eligibilityComputationQueue = new Queue<EligibilityComputationJobData>(
  'eligibility-computation',
  { connection: workerRedis, defaultJobOptions: DEFAULT_JOB_OPTIONS },
);

/**
 * BullMQ queue for early intervention analysis jobs.
 *
 * Enqueued weekly on Mondays at 07:00 Nigeria time.
 */
export const earlyInterventionQueue = new Queue<EarlyInterventionJobData>('early-intervention', {
  connection: workerRedis,
  defaultJobOptions: DEFAULT_JOB_OPTIONS,
});

/**
 * BullMQ queue for lecturer accountability score computation jobs.
 *
 * Enqueued weekly on Mondays at 08:00 Nigeria time.
 */
export const accountabilityQueue = new Queue<AccountabilityJobData>('lecturer-accountability', {
  connection: workerRedis,
  defaultJobOptions: DEFAULT_JOB_OPTIONS,
});

/**
 * BullMQ queue for welfare check jobs.
 *
 * Enqueued weekly on Mondays at 06:00 Nigeria time.
 */
export const welfareCheckQueue = new Queue<WelfareCheckJobData>('welfare-check', {
  connection: workerRedis,
  defaultJobOptions: DEFAULT_JOB_OPTIONS,
});

/**
 * BullMQ queue for weekly attendance summary notification jobs.
 *
 * Enqueued weekly on Mondays at 06:00 Nigeria time.
 */
export const weeklySummaryQueue = new Queue<WeeklySummaryJobData>('weekly-summary', {
  connection: workerRedis,
  defaultJobOptions: DEFAULT_JOB_OPTIONS,
});

/**
 * BullMQ queue for end-of-semester report generation jobs.
 *
 * Enqueued by the semester-end scheduler when `semester.endDate` passes.
 */
export const semesterReportsQueue = new Queue<SemesterReportsJobData>('semester-reports', {
  connection: workerRedis,
  defaultJobOptions: DEFAULT_JOB_OPTIONS,
});

/**
 * BullMQ queue for class register PDF generation jobs.
 *
 * Enqueued as sub-jobs by the semester-reports worker.
 */
export const classRegisterQueue = new Queue<ClassRegisterJobData>('class-register-pdf', {
  connection: workerRedis,
  defaultJobOptions: DEFAULT_JOB_OPTIONS,
});

/**
 * BullMQ queue for student report card PDF generation jobs.
 *
 * Enqueued as sub-jobs by the semester-reports worker.
 */
export const reportCardQueue = new Queue<ReportCardJobData>('student-report-card', {
  connection: workerRedis,
  defaultJobOptions: DEFAULT_JOB_OPTIONS,
});

/**
 * BullMQ queue for bulk account creation jobs.
 *
 * Enqueued by the admin bulk import endpoint after CSV upload.
 */
export const bulkAccountQueue = new Queue<BulkAccountJobData>('bulk-account-creation', {
  connection: workerRedis,
  defaultJobOptions: DEFAULT_JOB_OPTIONS,
});

/**
 * Payload for a `smart-conflict-detection` job.
 *
 * Enqueued weekly on Mondays at 09:00 Nigeria time.
 */
export interface SmartConflictDetectionJobData {
  /** UUID of the active `Semester` to scan for timetable conflicts. */
  semesterId: string;
}

/**
 * BullMQ queue for smart timetable conflict detection jobs.
 *
 * Enqueued weekly on Mondays at 09:00 Nigeria time.
 * Outputs `REPEATED_DAY_PATTERN` anomaly flags for ACADEMIC_AFFAIRS review.
 */
export const smartConflictQueue = new Queue<SmartConflictDetectionJobData>(
  'smart-conflict-detection',
  {
    connection: workerRedis,
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  },
);

/**
 * BullMQ queue for attendance heatmap refresh jobs.
 *
 * Enqueued every 30 seconds by the heatmap refresh scheduler.
 */
export const heatmapRefreshQueue = new Queue('heatmap-refresh', {
  connection: workerRedis,
  defaultJobOptions: DEFAULT_JOB_OPTIONS,
});

/**
 * Inline BullMQ worker for the `heatmap-refresh` queue.
 *
 * Runs every 30 seconds (scheduled by `registerHeatmapRefreshScheduler`).
 * Refreshes the Redis heatmap cache for all university venues.
 * The processor import is lazy to avoid a circular dependency at module load time.
 */
export const heatmapRefreshWorker = new Worker(
  'heatmap-refresh',
  async () => {
    const { refreshHeatmapCache } = await import('../modules/analytics/heatmap.service.js');
    await refreshHeatmapCache();
  },
  { connection: workerRedis, concurrency: 1 },
);

heatmapRefreshWorker.on('failed', (_job, err) => {
  console.error('[heatmap-refresh] Refresh job failed:', err.message);
});
