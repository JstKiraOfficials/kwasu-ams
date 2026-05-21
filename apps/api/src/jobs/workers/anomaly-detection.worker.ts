/**
 * @file anomaly-detection.worker.ts
 * @module jobs/workers
 *
 * BullMQ worker that processes `anomaly-detection` jobs after each session closes.
 *
 * Three detection checks run in parallel for every closed session:
 *
 * 1. **`LAST_MINUTE_PATTERN`** — Student consistently checks in in the last 5%
 *    of the session across 3+ sessions in the same course section.
 *
 * 2. **`BOUNDARY_CLUSTERING`** — Proxy check (GPS not stored): student has
 *    `spoofingFlagged: true` records in 3+ of the last 5 sessions in the same
 *    course section. This is a NDPA-compliant substitute for the GPS boundary
 *    edge pattern since coordinates are never persisted.
 *
 * 3. **`CLUSTER_IDENTICAL_GPS`** — Timestamp-based proxy (GPS not stored):
 *    3+ students checked in within the same 1-second window in the same session.
 *    Named `CLUSTER_IDENTICAL_GPS` to match the `AnomalyType` enum value.
 *
 * All flags are soft — no automatic bans, no status changes. Surfaced for
 * human review on lecturer and HOD dashboards.
 *
 * Idempotency: the `createAnomalyFlag` service uses `upsert` with the unique
 * constraint `[studentId, sessionId, flagType]`, so running the job twice for
 * the same session never creates duplicate flags.
 *
 * Error handling: BullMQ retries failed jobs up to 3 times with exponential
 * backoff (configured on the queue in `queue.ts`).
 */

import { Worker, type Job } from 'bullmq';
import { AnomalyType } from '@kwasu-ams/types';
import { prisma } from '../../lib/prisma.js';
import { redis } from '../../lib/redis.js';
import { createAnomalyFlag } from '../../modules/anomalies/anomalies.service.js';
import { type AnomalyDetectionJobData } from '../queue.js';

// =============================================================================
// System actor ID used for audit log entries written by background workers.
// This is a well-known sentinel UUID — not a real user record.
// =============================================================================

/** Sentinel actor ID used for audit log entries written by background workers. */
const SYSTEM_ACTOR_ID = '00000000-0000-4000-8000-000000000000';

// =============================================================================
// Detection helpers
// =============================================================================

/**
 * Check 1 — Last-5%-to-check-in pattern (`LAST_MINUTE_PATTERN`).
 *
 * Finds students who checked in in the last 5% of the session's check-in
 * window and have done so in 3+ sessions of the same course section.
 *
 * @param sessionId       - UUID of the closed `CourseSession`.
 * @param courseSectionId - UUID of the course section for cross-session lookup.
 * @returns A promise that resolves once all flags have been created.
 */
async function checkLastMinutePattern(sessionId: string, courseSectionId: string): Promise<void> {
  // Get all PRESENT records for this session ordered by check-in time
  const records = await prisma.attendanceRecord.findMany({
    where: { sessionId, status: 'PRESENT', checkedInAt: { not: null } },
    select: { studentId: true, checkedInAt: true },
    orderBy: { checkedInAt: 'asc' },
  });

  if (records.length < 2) return; // Need at least 2 records to compute a percentile

  // 95th percentile index — students at or after this index are in the last 5%
  const p95Index = Math.floor(records.length * 0.95);
  const lateStudentIds = records.slice(p95Index).map((r) => r.studentId);

  if (lateStudentIds.length === 0) return;

  // For each late student, count how many sessions in this course they appear in the last 5%
  await Promise.all(
    lateStudentIds.map(async (studentId) => {
      // Get all sessions in this course section (excluding current) with PRESENT records
      const historySessions = await prisma.courseSession.findMany({
        where: {
          courseSectionId,
          id: { not: sessionId },
          status: { in: ['CLOSED', 'LOCKED'] },
        },
        select: { id: true },
        orderBy: { actualEnd: 'desc' },
        take: 10, // Look back at most 10 sessions
      });

      let lateCount = 0;

      for (const pastSession of historySessions) {
        const pastRecords = await prisma.attendanceRecord.findMany({
          where: { sessionId: pastSession.id, status: 'PRESENT', checkedInAt: { not: null } },
          select: { studentId: true, checkedInAt: true },
          orderBy: { checkedInAt: 'asc' },
        });

        if (pastRecords.length < 2) continue;

        const pastP95Index = Math.floor(pastRecords.length * 0.95);
        const pastLateIds = new Set(pastRecords.slice(pastP95Index).map((r) => r.studentId));

        if (pastLateIds.has(studentId)) {
          lateCount++;
        }
      }

      // Include the current session in the count
      lateCount++;

      if (lateCount >= 3) {
        await createAnomalyFlag(
          {
            studentId,
            sessionId,
            flagType: AnomalyType.LAST_MINUTE_PATTERN,
            description:
              'Student consistently checks in in the last 5% of the session across 3+ sessions.',
          },
          SYSTEM_ACTOR_ID,
        );
      }
    }),
  );
}

/**
 * Check 2 — Boundary clustering proxy (`BOUNDARY_CLUSTERING`).
 *
 * GPS coordinates are never stored (NDPA 2023 compliance), so the GPS
 * boundary edge pattern cannot be computed server-side. This proxy check
 * flags students with `spoofingFlagged: true` in 3+ of the last 5 sessions
 * in the same course section as a correlated suspicious signal.
 *
 * @param sessionId       - UUID of the closed `CourseSession`.
 * @param courseSectionId - UUID of the course section for cross-session lookup.
 * @returns A promise that resolves once all flags have been created.
 */
async function checkBoundaryClustering(sessionId: string, courseSectionId: string): Promise<void> {
  // Students with spoofing flags in this session
  const flaggedRecords = await prisma.attendanceRecord.findMany({
    where: { sessionId, spoofingFlagged: true },
    select: { studentId: true },
  });

  if (flaggedRecords.length === 0) return;

  const flaggedStudentIds = [...new Set(flaggedRecords.map((r) => r.studentId))];

  // Get the last 5 sessions in this course section (excluding current)
  const recentSessions = await prisma.courseSession.findMany({
    where: {
      courseSectionId,
      id: { not: sessionId },
      status: { in: ['CLOSED', 'LOCKED'] },
    },
    select: { id: true },
    orderBy: { actualEnd: 'desc' },
    take: 4, // Last 4 + current = 5 total
  });

  const recentSessionIds = recentSessions.map((s) => s.id);

  await Promise.all(
    flaggedStudentIds.map(async (studentId) => {
      const spoofingCount = await prisma.attendanceRecord.count({
        where: {
          studentId,
          sessionId: { in: recentSessionIds },
          spoofingFlagged: true,
        },
      });

      // +1 for the current session
      if (spoofingCount + 1 >= 3) {
        await createAnomalyFlag(
          {
            studentId,
            sessionId,
            flagType: AnomalyType.BOUNDARY_CLUSTERING,
            description: 'Student has repeated spoofing flags across 3+ sessions.',
          },
          SYSTEM_ACTOR_ID,
        );
      }
    }),
  );
}

/**
 * Check 3 — Cluster of simultaneous check-ins (`CLUSTER_IDENTICAL_GPS`).
 *
 * GPS coordinates are never stored (NDPA 2023 compliance), so the "identical
 * GPS within 1m" check is replaced by a timestamp-based proxy: 3+ students
 * checking in within the same 1-second window is flagged as suspicious.
 *
 * The flag is created once per session (not per student) using a sentinel
 * student ID from the first student in the cluster. The description includes
 * the cluster size.
 *
 * @param sessionId - UUID of the closed `CourseSession`.
 * @returns A promise that resolves once all flags have been created.
 */
async function checkClusterCheckins(sessionId: string): Promise<void> {
  const records = await prisma.attendanceRecord.findMany({
    where: { sessionId, status: 'PRESENT', checkedInAt: { not: null } },
    select: { studentId: true, checkedInAt: true },
    orderBy: { checkedInAt: 'asc' },
  });

  if (records.length < 3) return;

  // Group records into 1-second windows
  const windows: Array<{ studentIds: string[]; windowStart: Date }> = [];
  let currentWindow: { studentIds: string[]; windowStart: Date } | null = null;

  for (const record of records) {
    const ts = record.checkedInAt!.getTime();

    if (currentWindow === null || ts - currentWindow.windowStart.getTime() > 1000) {
      currentWindow = { studentIds: [record.studentId], windowStart: record.checkedInAt! };
      windows.push(currentWindow);
    } else {
      currentWindow.studentIds.push(record.studentId);
    }
  }

  // Flag any window with 3+ students
  await Promise.all(
    windows
      .filter((w) => w.studentIds.length >= 3)
      .map(async (w) => {
        // Create one flag per student in the cluster
        await Promise.all(
          w.studentIds.map((studentId) =>
            createAnomalyFlag(
              {
                studentId,
                sessionId,
                flagType: AnomalyType.CLUSTER_IDENTICAL_GPS,
                description: `Cluster of ${w.studentIds.length} students checked in within 1 second in the same session.`,
              },
              SYSTEM_ACTOR_ID,
            ),
          ),
        );
      }),
  );
}

// =============================================================================
// processAnomalyDetection — main job handler
// =============================================================================

/**
 * Runs all three anomaly detection checks for a closed session in parallel.
 *
 * Called by the BullMQ worker on every `anomaly-detection` job. Safe to call
 * multiple times for the same session — `createAnomalyFlag` is idempotent.
 *
 * @param sessionId - UUID of the closed `CourseSession` to analyse.
 * @returns A promise that resolves once all checks complete.
 */
export async function processAnomalyDetection(sessionId: string): Promise<void> {
  // Fetch session to get courseSectionId
  const session = await prisma.courseSession.findUnique({
    where: { id: sessionId },
    select: { id: true, courseSectionId: true },
  });

  if (!session) {
    // Session deleted between close and job execution — nothing to do
    return;
  }

  const { courseSectionId } = session;

  // Run all three checks in parallel
  await Promise.all([
    checkLastMinutePattern(sessionId, courseSectionId),
    checkBoundaryClustering(sessionId, courseSectionId),
    checkClusterCheckins(sessionId),
  ]);

  // Write a summary audit log entry
  void prisma.auditLog.create({
    data: {
      actorId: SYSTEM_ACTOR_ID,
      actorRole: 'SUPER_ADMIN',
      action: 'ATTENDANCE_RECORDED',
      entityType: 'CourseSession',
      entityId: sessionId,
      metadata: { event: 'ANOMALY_DETECTION_COMPLETE', sessionId },
    },
  });
}

// =============================================================================
// BullMQ Worker registration
// =============================================================================

/**
 * BullMQ worker instance for the `anomaly-detection` queue.
 *
 * Processes one job at a time (`concurrency: 1`) to avoid overwhelming the
 * database with parallel cross-session queries. The worker is exported so
 * `index.ts` can gracefully shut it down on SIGTERM.
 *
 * Retry policy (3 attempts, exponential backoff) is configured on the queue
 * in `queue.ts`.
 */
export const anomalyDetectionWorker = new Worker<AnomalyDetectionJobData>(
  'anomaly-detection',
  async (job: Job<AnomalyDetectionJobData>) => {
    await processAnomalyDetection(job.data.sessionId);
  },
  {
    connection: redis,
    concurrency: 1,
  },
);

anomalyDetectionWorker.on('failed', (job, err) => {
  console.error(
    `[anomaly-detection] Job ${job?.id ?? 'unknown'} failed for session ${job?.data.sessionId ?? 'unknown'}:`,
    err.message,
  );
});
