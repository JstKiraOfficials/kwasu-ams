/**
 * @file early-intervention.worker.ts
 * @module jobs/workers
 *
 * BullMQ worker for the early intervention analysis job.
 *
 * Runs weekly (Monday 07:00 Nigeria time). For every active enrollment in the
 * semester the worker projects the final attendance percentage using
 * `projectFinalPercentage()`. If the projection falls below the semester
 * threshold it sets `ExamEligibility.atRiskPredicted = true`; otherwise it
 * resets the flag to `false` so improvements are reflected on re-runs.
 *
 * HODs receive a weekly Early Intervention Report email listing all at-risk
 * students in their department. No attendance or eligibility records are
 * modified — this is advisory only.
 */

import { Worker, type Job } from 'bullmq';
import { redis } from '../../lib/redis.js';
import { prisma } from '../../lib/prisma.js';
import { projectFinalPercentage, classesNeededForThreshold } from '@kwasu-ams/utils';
import { notificationQueue, type EarlyInterventionJobData } from '../queue.js';

// =============================================================================
// Internal helpers
// =============================================================================

/**
 * Estimates remaining sessions for a course section until the exam start date.
 *
 * Formula: `weeksRemaining × timetableEntriesPerWeek`.
 * Falls back to 1 session per week when no timetable entries exist.
 *
 * @param examStartDate   - Exam start date for the semester.
 * @param courseSectionId - UUID of the course section.
 * @returns Estimated remaining session count (≥ 0).
 */
async function estimateRemainingSessions(
  examStartDate: Date,
  courseSectionId: string,
): Promise<number> {
  const now = new Date();
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const weeksRemaining = Math.max(
    0,
    Math.ceil((examStartDate.getTime() - now.getTime()) / msPerWeek),
  );
  if (weeksRemaining === 0) return 0;

  const entryCount = await prisma.timetableEntry.count({ where: { courseSectionId } });
  const sessionsPerWeek = entryCount > 0 ? entryCount : 1;
  return weeksRemaining * sessionsPerWeek;
}

// =============================================================================
// processEarlyIntervention
// =============================================================================

/**
 * Processes a single `early-intervention` BullMQ job.
 *
 * For each enrollment: projects final attendance and upserts `atRiskPredicted`.
 * Groups at-risk students by HOD department and enqueues email reports.
 *
 * @param job - BullMQ job containing {@link EarlyInterventionJobData}.
 * @returns A promise that resolves once all predictions and notifications are queued.
 */
export async function processEarlyIntervention(job: Job<EarlyInterventionJobData>): Promise<void> {
  const { semesterId } = job.data;

  const semester = await prisma.semester.findUnique({
    where: { id: semesterId },
    select: { eligibilityThreshold: true, examStartDate: true },
  });
  if (!semester) return;

  const { eligibilityThreshold: threshold, examStartDate } = semester;

  // Fetch all active enrollments with attendance and section data
  const enrollments = await prisma.courseEnrollment.findMany({
    where: { courseSection: { semesterId }, droppedAt: null },
    select: {
      id: true,
      courseSectionId: true,
      student: {
        select: {
          id: true,
          matricNumber: true,
          programme: { select: { departmentId: true } },
          user: { select: { fullName: true } },
        },
      },
      courseSection: {
        select: {
          course: { select: { code: true, title: true } },
          sessions: {
            where: { status: { in: ['CLOSED', 'LOCKED'] } },
            select: { id: true },
          },
        },
      },
      attendanceRecords: { select: { status: true } },
    },
  });

  /** HOD report map: departmentId → at-risk entries for email body. */
  const hodReports = new Map<
    string,
    Array<{
      studentName: string;
      matricNumber: string;
      courseCode: string;
      courseTitle: string;
      currentPct: number;
      projectedPct: number;
      classesNeeded: number;
    }>
  >();

  // Project each enrollment and update atRiskPredicted
  for (const enrollment of enrollments) {
    const totalSessionsSoFar = enrollment.courseSection.sessions.length;
    const currentPresent = enrollment.attendanceRecords.filter((r) =>
      ['PRESENT', 'LATE', 'MANUAL_OVERRIDE', 'EXCUSED'].includes(r.status),
    ).length;

    const remainingSessions = examStartDate
      ? await estimateRemainingSessions(examStartDate, enrollment.courseSectionId)
      : 0;

    const projectedFinalPercentage = projectFinalPercentage(
      currentPresent,
      totalSessionsSoFar,
      remainingSessions,
    );

    const eligibility = await prisma.examEligibility.findFirst({
      where: { enrollmentId: enrollment.id, semesterId },
      select: { id: true, effectivePercentage: true },
    });
    if (!eligibility) continue;

    const isAtRisk = projectedFinalPercentage < threshold;

    // Upsert atRiskPredicted — resets to false when student improves
    await prisma.examEligibility.update({
      where: { id: eligibility.id },
      data: { atRiskPredicted: isAtRisk },
    });

    if (isAtRisk) {
      const needed = classesNeededForThreshold(
        currentPresent,
        totalSessionsSoFar,
        remainingSessions,
        threshold,
      );
      const deptId = enrollment.student.programme.departmentId;
      const existing = hodReports.get(deptId) ?? [];
      existing.push({
        studentName: enrollment.student.user.fullName,
        matricNumber: enrollment.student.matricNumber,
        courseCode: enrollment.courseSection.course.code,
        courseTitle: enrollment.courseSection.course.title,
        currentPct: eligibility.effectivePercentage,
        projectedPct: projectedFinalPercentage,
        classesNeeded: needed,
      });
      hodReports.set(deptId, existing);
    }
  }

  // Notify HODs with formatted Early Intervention Report
  for (const [deptId, atRiskList] of hodReports) {
    const department = await prisma.department.findUnique({
      where: { id: deptId },
      select: { name: true },
    });
    const hod = await prisma.user.findFirst({
      where: { role: 'HOD', scopeId: deptId },
      select: { id: true, fullName: true },
    });
    if (!hod) continue;

    // Group by course for the report body
    const byCourse = new Map<string, typeof atRiskList>();
    for (const entry of atRiskList) {
      const key = `${entry.courseCode} — ${entry.courseTitle}`;
      const list = byCourse.get(key) ?? [];
      list.push(entry);
      byCourse.set(key, list);
    }

    const reportLines: string[] = [];
    for (const [courseLabel, students] of byCourse) {
      reportLines.push(courseLabel);
      for (const s of students) {
        reportLines.push(
          `  - ${s.matricNumber} ${s.studentName}: Current ${s.currentPct}%, Projected ${s.projectedPct}%, Needs ${s.classesNeeded} more classes`,
        );
      }
    }

    const deptName = department?.name ?? deptId;
    const reportDate = new Date().toDateString();
    const summary = [
      `Subject: Early Intervention Report — ${deptName} — ${reportDate}`,
      '',
      'The following students are projected to miss the exam eligibility threshold',
      'before the end of the semester:',
      '',
      ...reportLines,
      '',
      'This report is generated automatically every Monday. No action has been taken.',
      'Please review and contact at-risk students.',
    ].join('\n');

    void notificationQueue.add('dispatch', {
      recipientId: hod.id,
      trigger: 'COURSE_AVERAGE_LOW',
      data: {
        recipientName: hod.fullName ?? 'HOD',
        courseCode: 'Multiple',
        average: String(atRiskList.length),
        summary,
      },
    });
  }

  console.info(
    `[early-intervention] Processed ${enrollments.length} enrollments for semester ${semesterId}. At-risk departments: ${hodReports.size}`,
  );
}

// =============================================================================
// Worker instance
// =============================================================================

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
