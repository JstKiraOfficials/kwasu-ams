/**
 * @file welfare-check.worker.ts
 * @module jobs/workers
 *
 * BullMQ worker for weekly welfare check jobs.
 *
 * Runs weekly (Monday 06:00 Nigeria time). For each active student, counts
 * courses where `effectivePercentage < 70`. If a student has 3+ such courses,
 * enqueues a `WELFARE_REFERRAL` notification and alerts their HOD.
 *
 * This runs weekly rather than per session close to avoid expensive queries
 * after every class across all courses.
 */

import { Worker, type Job } from 'bullmq';
import { redis } from '../../lib/redis.js';
import { prisma } from '../../lib/prisma.js';
import { notificationQueue, type WelfareCheckJobData } from '../queue.js';

/** Minimum number of at-risk courses to trigger a welfare referral. */
const WELFARE_THRESHOLD_COURSES = 3;

/** Attendance percentage below which a course is considered at-risk. */
const WELFARE_ATTENDANCE_THRESHOLD = 70;

/**
 * Processes a single `welfare-check` job.
 *
 * Queries all students with eligibility records in the semester and flags
 * those with 3+ courses below 70% effective attendance.
 *
 * @param job - BullMQ job containing {@link WelfareCheckJobData}.
 * @returns A promise that resolves once all welfare checks are complete.
 */
export async function processWelfareCheck(job: Job<WelfareCheckJobData>): Promise<void> {
  const { semesterId } = job.data;

  // Get all students with eligibility records this semester
  const eligibilityRecords = await prisma.examEligibility.findMany({
    where: { semesterId },
    select: {
      studentId: true,
      effectivePercentage: true,
      student: {
        select: {
          user: { select: { id: true } },
          programme: { select: { departmentId: true } },
        },
      },
    },
  });

  // Group by student
  const studentMap = new Map<
    string,
    { userId: string; departmentId: string; atRiskCount: number }
  >();

  for (const record of eligibilityRecords) {
    const existing = studentMap.get(record.studentId);
    const isAtRisk = record.effectivePercentage < WELFARE_ATTENDANCE_THRESHOLD;

    if (existing) {
      if (isAtRisk) existing.atRiskCount++;
    } else {
      studentMap.set(record.studentId, {
        userId: record.student.user.id,
        departmentId: record.student.programme.departmentId,
        atRiskCount: isAtRisk ? 1 : 0,
      });
    }
  }

  // Enqueue welfare referrals for students with 3+ at-risk courses
  for (const [, studentData] of studentMap) {
    if (studentData.atRiskCount >= WELFARE_THRESHOLD_COURSES) {
      void notificationQueue.add('dispatch', {
        recipientId: studentData.userId,
        trigger: 'WELFARE_REFERRAL',
        data: { atRiskCourseCount: String(studentData.atRiskCount) },
      });

      // Alert HOD
      const hod = await prisma.user.findFirst({
        where: { role: 'HOD', scopeId: studentData.departmentId },
        select: { id: true },
      });
      if (hod) {
        void notificationQueue.add('dispatch', {
          recipientId: hod.id,
          trigger: 'WELFARE_REFERRAL',
          data: { atRiskCourseCount: String(studentData.atRiskCount) },
        });
      }
    }
  }

  console.info(`[welfare-check] Processed ${studentMap.size} students for semester ${semesterId}`);
}

/**
 * BullMQ worker instance for the `welfare-check` queue.
 *
 * Concurrency 1 — runs weekly, not time-critical.
 */
export const welfareCheckWorker = new Worker<WelfareCheckJobData>(
  'welfare-check',
  processWelfareCheck,
  { connection: redis, concurrency: 1 },
);

welfareCheckWorker.on('failed', (job, err) => {
  console.error(
    `[welfare-check] Job ${job?.id ?? 'unknown'} failed for semester ${job?.data.semesterId ?? 'unknown'}:`,
    err.message,
  );
});
