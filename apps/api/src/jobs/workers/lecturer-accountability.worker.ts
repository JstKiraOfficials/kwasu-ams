/**
 * @file lecturer-accountability.worker.ts
 * @module jobs/workers
 *
 * BullMQ worker for lecturer accountability score computation.
 *
 * Runs weekly (Monday 08:00 Nigeria time). Computes an accountability score
 * (0–100) for each lecturer based on:
 * - Sessions held vs scheduled (40%)
 * - Average session duration accuracy (20%)
 * - Average attendance rate across sessions (30%)
 * - Override frequency (10%)
 *
 * Updates `Lecturer.accountabilityScore` for each lecturer.
 */

import { Worker, type Job } from 'bullmq';
import { redis } from '../../lib/redis.js';
import { prisma } from '../../lib/prisma.js';
import { computeAttendancePercentage } from '@kwasu-ams/utils';
import { type AccountabilityJobData } from '../queue.js';

/**
 * Computes the accountability score for a single lecturer.
 *
 * @param lecturerId - UUID of the `Lecturer` record.
 * @param semesterId - UUID of the active `Semester`.
 * @returns Accountability score in the range 0–100.
 */
async function computeScore(lecturerId: string, semesterId: string): Promise<number> {
  const sections = await prisma.courseSection.findMany({
    where: { semesterId, lecturerId },
    select: { id: true },
  });

  if (sections.length === 0) return 0;

  const sectionIds = sections.map((s) => s.id);

  const sessions = await prisma.courseSession.findMany({
    where: { courseSectionId: { in: sectionIds } },
    select: {
      status: true,
      scheduledStart: true,
      scheduledEnd: true,
      actualStart: true,
      actualEnd: true,
      attendanceRecords: { select: { status: true } },
      _count: { select: { attendanceRecords: true } },
    },
  });

  const scheduled = sessions.length;
  const held = sessions.filter((s) => s.status !== 'SCHEDULED').length;

  if (scheduled === 0) return 0;

  // Sessions held score (40 points)
  const heldScore = (held / scheduled) * 40;

  // Duration accuracy score (20 points)
  let durationScore = 20;
  const completedSessions = sessions.filter((s) => s.actualStart && s.actualEnd);
  if (completedSessions.length > 0) {
    const accuracies = completedSessions.map((s) => {
      const scheduled_ms =
        new Date(s.scheduledEnd).getTime() - new Date(s.scheduledStart).getTime();
      const actual_ms = new Date(s.actualEnd!).getTime() - new Date(s.actualStart!).getTime();
      return Math.min(1, actual_ms / Math.max(scheduled_ms, 1));
    });
    const avgAccuracy = accuracies.reduce((a, b) => a + b, 0) / accuracies.length;
    durationScore = avgAccuracy * 20;
  }

  // Attendance rate score (30 points)
  let attendanceScore = 0;
  const closedSessions = sessions.filter((s) => ['CLOSED', 'LOCKED'].includes(s.status));
  if (closedSessions.length > 0) {
    const rates = closedSessions.map((s) => {
      const total = s.attendanceRecords.length;
      const present = s.attendanceRecords.filter((r) =>
        ['PRESENT', 'LATE', 'MANUAL_OVERRIDE', 'EXCUSED'].includes(r.status),
      ).length;
      return computeAttendancePercentage(present, total);
    });
    const avgRate = rates.reduce((a, b) => a + b, 0) / rates.length;
    attendanceScore = (avgRate / 100) * 30;
  }

  // Override frequency score (10 points)
  const overrideCount = await prisma.manualOverride.count({
    where: { actorId: lecturerId },
  });
  const overrideScore = Math.max(0, 10 - (overrideCount / Math.max(held, 1)) * 100);

  return Math.round(heldScore + durationScore + attendanceScore + overrideScore);
}

/**
 * Processes a single `lecturer-accountability` job.
 *
 * @param job - BullMQ job containing {@link AccountabilityJobData}.
 * @returns A promise that resolves once all lecturer scores are updated.
 */
export async function processLecturerAccountability(
  job: Job<AccountabilityJobData>,
): Promise<void> {
  const { semesterId } = job.data;

  const lecturers = await prisma.lecturer.findMany({ select: { id: true } });

  for (const lecturer of lecturers) {
    const score = await computeScore(lecturer.id, semesterId);
    await prisma.lecturer.update({
      where: { id: lecturer.id },
      data: { accountabilityScore: score },
    });
  }

  console.info(`[lecturer-accountability] Updated scores for ${lecturers.length} lecturers`);
}

/**
 * BullMQ worker instance for the `lecturer-accountability` queue.
 *
 * Concurrency 1 — runs weekly, not time-critical.
 */
export const lecturerAccountabilityWorker = new Worker<AccountabilityJobData>(
  'lecturer-accountability',
  processLecturerAccountability,
  { connection: redis, concurrency: 1 },
);

lecturerAccountabilityWorker.on('failed', (job, err) => {
  console.error(`[lecturer-accountability] Job ${job?.id ?? 'unknown'} failed:`, err.message);
});
