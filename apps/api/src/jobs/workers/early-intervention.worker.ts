/**
 * @file early-intervention.worker.ts
 * @module jobs/workers
 *
 * BullMQ worker for early intervention analysis jobs.
 *
 * Runs weekly (Monday 07:00 Nigeria time). For each student with PENDING or
 * BARRED eligibility, projects their final attendance percentage using
 * `projectFinalPercentage()`. Sets `atRiskPredicted = true` on records where
 * the projected final is below the threshold. Compiles per-HOD reports and
 * enqueues email notifications.
 */

import { Worker, type Job } from 'bullmq';
import { redis } from '../../lib/redis.js';
import { prisma } from '../../lib/prisma.js';
import { projectFinalPercentage } from '@kwasu-ams/utils';
import { notificationQueue, type EarlyInterventionJobData } from '../queue.js';

/**
 * Processes a single `early-intervention` job.
 *
 * @param job - BullMQ job containing {@link EarlyInterventionJobData}.
 * @returns A promise that resolves once all at-risk predictions are updated.
 */
export async function processEarlyIntervention(job: Job<EarlyInterventionJobData>): Promise<void> {
  const { semesterId } = job.data;

  const semester = await prisma.semester.findUnique({
    where: { id: semesterId },
    select: { eligibilityThreshold: true },
  });
  if (!semester) return;

  const threshold = semester.eligibilityThreshold;

  // Get all PENDING/BARRED eligibility records
  const records = await prisma.examEligibility.findMany({
    where: { semesterId, status: { in: ['PENDING', 'BARRED'] } },
    include: {
      enrollment: {
        include: {
          courseSection: {
            include: {
              sessions: { where: { status: { in: ['CLOSED', 'LOCKED'] } }, select: { id: true } },
              course: { select: { code: true } },
            },
          },
          attendanceRecords: { select: { status: true } },
          student: {
            include: {
              user: { select: { id: true } },
              programme: {
                include: {
                  department: {
                    include: { hodId: true } as never,
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  // HOD report map: departmentId → list of at-risk entries
  const hodReports = new Map<
    string,
    Array<{ studentName: string; courseCode: string; currentPct: number; projectedPct: number }>
  >();

  for (const record of records) {
    const totalSessions = record.enrollment.courseSection.sessions.length;
    const presentCount = record.enrollment.attendanceRecords.filter((r) =>
      ['PRESENT', 'LATE', 'MANUAL_OVERRIDE', 'EXCUSED'].includes(r.status),
    ).length;

    // Estimate remaining sessions (assume 2 per week for 4 remaining weeks)
    const remainingSessions = 8;
    const projected = projectFinalPercentage(presentCount, totalSessions, remainingSessions);

    if (projected < threshold) {
      // Mark as at-risk
      await prisma.examEligibility.update({
        where: { id: record.id },
        data: { atRiskPredicted: true },
      });

      const deptId = record.enrollment.student.programme.departmentId;
      const existing = hodReports.get(deptId) ?? [];
      existing.push({
        studentName: (record.enrollment.student as unknown as { user: { fullName: string } }).user
          .fullName,
        courseCode: record.enrollment.courseSection.course.code,
        currentPct: record.effectivePercentage,
        projectedPct: projected,
      });
      hodReports.set(deptId, existing);
    }
  }

  // Notify HODs with their at-risk reports
  for (const [deptId, atRiskList] of hodReports) {
    const hod = await prisma.user.findFirst({
      where: { role: 'HOD', scopeId: deptId },
      select: { id: true },
    });
    if (hod) {
      const summary = atRiskList
        .map(
          (e) =>
            `${e.studentName} — ${e.courseCode}: ${e.currentPct}% (projected: ${e.projectedPct}%)`,
        )
        .join('\n');
      void notificationQueue.add('dispatch', {
        recipientId: hod.id,
        trigger: 'COURSE_AVERAGE_LOW',
        data: {
          recipientName: 'HOD',
          courseCode: 'Multiple',
          average: String(atRiskList.length),
          summary,
        },
      });
    }
  }

  console.info(
    `[early-intervention] Processed ${records.length} records for semester ${semesterId}`,
  );
}

/**
 * BullMQ worker instance for the `early-intervention` queue.
 *
 * Concurrency 1 — runs weekly, not time-critical.
 */
export const earlyInterventionWorker = new Worker<EarlyInterventionJobData>(
  'early-intervention',
  processEarlyIntervention,
  { connection: redis, concurrency: 1 },
);

earlyInterventionWorker.on('failed', (job, err) => {
  console.error(
    `[early-intervention] Job ${job?.id ?? 'unknown'} failed for semester ${job?.data.semesterId ?? 'unknown'}:`,
    err.message,
  );
});
