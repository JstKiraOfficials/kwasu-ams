/**
 * @file weekly-summary.worker.ts
 * @module jobs/workers
 *
 * BullMQ worker for weekly attendance summary notification jobs.
 *
 * Runs weekly (Monday 06:00 Nigeria time). For each active student, compiles
 * a summary of attendance per course over the last 7 days and enqueues a
 * `WEEKLY_SUMMARY` notification.
 */

import { Worker, type Job } from 'bullmq';
import { redis } from '../../lib/redis.js';
import { prisma } from '../../lib/prisma.js';
import { computeAttendancePercentage } from '@kwasu-ams/utils';
import { notificationQueue, type WeeklySummaryJobData } from '../queue.js';

/**
 * Processes a single `weekly-summary` job.
 *
 * @param job - BullMQ job containing {@link WeeklySummaryJobData}.
 * @returns A promise that resolves once all summary notifications are queued.
 */
export async function processWeeklySummary(job: Job<WeeklySummaryJobData>): Promise<void> {
  const { semesterId } = job.data;
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const students = await prisma.student.findMany({
    where: { enrollments: { some: { courseSection: { semesterId } } } },
    select: {
      user: { select: { id: true } },
      enrollments: {
        where: { courseSection: { semesterId } },
        select: {
          courseSection: { select: { course: { select: { code: true } } } },
          attendanceRecords: {
            where: { checkedInAt: { gte: sevenDaysAgo } },
            select: { status: true },
          },
        },
      },
    },
  });

  for (const student of students) {
    const lines = student.enrollments.map((e) => {
      const total = e.attendanceRecords.length;
      const present = e.attendanceRecords.filter((r) =>
        ['PRESENT', 'LATE', 'MANUAL_OVERRIDE'].includes(r.status),
      ).length;
      const pct = computeAttendancePercentage(present, total);
      return `${e.courseSection.course.code}: ${present}/${total} (${pct}%)`;
    });

    if (lines.length > 0) {
      void notificationQueue.add('dispatch', {
        recipientId: student.user.id,
        trigger: 'WEEKLY_SUMMARY',
        data: { summary: lines.join(', '), recipientName: 'Student' },
      });
    }
  }

  console.info(`[weekly-summary] Queued summaries for ${students.length} students`);
}

/**
 * BullMQ worker instance for the `weekly-summary` queue.
 *
 * Concurrency 1 — runs weekly, not time-critical.
 */
export const weeklySummaryWorker = new Worker<WeeklySummaryJobData>(
  'weekly-summary',
  processWeeklySummary,
  { connection: redis, concurrency: 1 },
);

weeklySummaryWorker.on('failed', (job, err) => {
  console.error(`[weekly-summary] Job ${job?.id ?? 'unknown'} failed:`, err.message);
});
