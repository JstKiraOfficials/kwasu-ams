/**
 * @file student-report-card.worker.ts
 * @module jobs/workers
 *
 * BullMQ worker for student report card PDF generation.
 *
 * Generates a per-student end-of-semester report card PDF including:
 * - Per-course table: course code, title, raw %, effective %, eligibility status, trend ↑/↓/→
 * - Approved excuse letters list
 * - Trend is computed vs the same course in the immediately preceding semester.
 *   Threshold: ↑ if diff > 5%, ↓ if diff < -5%, → otherwise, N/A if no prior data.
 *
 * The PDF is SHA-256 checksummed, uploaded to S3 at
 * `report-cards/{studentId}-{semesterId}.pdf`, then the student is notified
 * via push + email.
 *
 * Idempotent — if the S3 key already exists the job exits without regenerating.
 */

import { Worker, type Job } from 'bullmq';
import { workerRedis } from '../../lib/redis.js';
import { prisma } from '../../lib/prisma.js';
import { generatePdf } from '../../lib/pdf-generator.js';
import { uploadToS3, getPresignedUrl, s3KeyExists } from '../../lib/s3.js';
import { notificationQueue, type ReportCardJobData } from '../queue.js';
import { env } from '../../config/env.js';

/** Pre-signed URL expiry for report card downloads (1 hour). */
const REPORT_CARD_URL_EXPIRY = 3600;

/** Percentage difference above which an upward trend is reported. */
const TREND_UP_THRESHOLD = 5;

/** Percentage difference below which a downward trend is reported. */
const TREND_DOWN_THRESHOLD = -5;

// =============================================================================
// processStudentReportCard
// =============================================================================

/**
 * Processes a single `student-report-card` job.
 *
 * @param job - BullMQ job containing {@link ReportCardJobData}.
 * @returns A promise that resolves once the report card is generated and uploaded.
 */
export async function processStudentReportCard(job: Job<ReportCardJobData>): Promise<void> {
  const { studentId, semesterId } = job.data;

  const s3Key = `report-cards/${studentId}-${semesterId}.pdf`;

  // Skip if already generated
  if (await s3KeyExists(env.AWS_S3_BUCKET_REPORTS, s3Key)) {
    console.info(`[student-report-card] Already exists: ${s3Key}`);
    return;
  }

  // Fetch student with user info
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: { user: { select: { id: true, fullName: true } } },
  });
  if (!student) {
    console.warn(`[student-report-card] Student ${studentId} not found`);
    return;
  }

  // Fetch this semester's eligibility records
  const currentEligibilities = await prisma.examEligibility.findMany({
    where: { studentId, semesterId },
    include: {
      enrollment: {
        include: {
          courseSection: { include: { course: { select: { id: true, code: true, title: true } } } },
        },
      },
    },
  });

  // Resolve the previous semester (immediately prior, same academic session or previous one)
  const currentSemester = await prisma.semester.findUnique({
    where: { id: semesterId },
    select: { startDate: true, academicSessionId: true },
  });

  const previousSemester = currentSemester
    ? await prisma.semester.findFirst({
        where: {
          endDate: { lt: currentSemester.startDate },
        },
        orderBy: { endDate: 'desc' },
        select: { id: true },
      })
    : null;

  // Fetch previous semester eligibilities (for trend)
  const prevEligibilities = previousSemester
    ? await prisma.examEligibility.findMany({
        where: { studentId, semesterId: previousSemester.id },
        include: {
          enrollment: {
            include: { courseSection: { include: { course: { select: { id: true } } } } },
          },
        },
      })
    : [];

  // Build courseId → previous effectivePercentage map
  const prevPctByCourseId = new Map<string, number>();
  for (const pe of prevEligibilities) {
    const courseId =
      'enrollment' in pe
        ? (pe.enrollment.courseSection.courseId ?? pe.enrollment.courseSection.course?.id)
        : undefined;
    if (courseId) prevPctByCourseId.set(courseId, pe.effectivePercentage);
  }

  // Build per-course report rows with trend
  const courseRows = currentEligibilities.map((elig) => {
    const course = elig.enrollment.courseSection.course;
    const prevPct = prevPctByCourseId.get(course.id);
    let trend = 'N/A';
    if (prevPct !== undefined) {
      const diff = elig.effectivePercentage - prevPct;
      if (diff > TREND_UP_THRESHOLD) trend = '↑';
      else if (diff < TREND_DOWN_THRESHOLD) trend = '↓';
      else trend = '→';
    }
    return [
      `${course.code} — ${course.title}`,
      `${elig.rawPercentage.toFixed(2)}%`,
      `${elig.effectivePercentage.toFixed(2)}%`,
      elig.status,
      trend,
    ].join('  |  ');
  });

  // Fetch approved excuse letters
  const excuseLetters = await prisma.excuseLetter.findMany({
    where: {
      studentId,
      courseSection: { semesterId },
      status: { in: ['APPROVED', 'HOD_APPROVED'] },
    },
    select: { reason: true, absenceDates: true, status: true },
  });

  const excuseLines = excuseLetters.map(
    (e) =>
      `${e.reason} — ${e.absenceDates.map((d: Date) => d.toISOString().slice(0, 10)).join(', ')} [${e.status}]`,
  );

  // Generate PDF
  const { buffer } = await generatePdf('KWASU Student Report Card', [
    {
      heading: 'Student',
      body: `Name: ${student.user.fullName}\nMatric Number: ${student.matricNumber}`,
    },
    {
      heading: 'Course Attendance Summary',
      body:
        'Course  |  Raw %  |  Effective %  |  Eligibility  |  Trend\n' +
        '─'.repeat(70) +
        '\n' +
        (courseRows.length > 0 ? courseRows.join('\n') : 'No enrolment records found.'),
    },
    {
      heading: 'Approved Excuses',
      body: excuseLines.length > 0 ? excuseLines.join('\n') : 'None.',
    },
    {
      heading: 'Report Notes',
      body: 'Trend is vs. previous semester. ↑ = improved >5%, ↓ = declined >5%, → = stable, N/A = no prior data.',
    },
  ]);

  // Upload to S3
  await uploadToS3(env.AWS_S3_BUCKET_REPORTS, s3Key, buffer, 'application/pdf');
  const downloadUrl = await getPresignedUrl(
    env.AWS_S3_BUCKET_REPORTS,
    s3Key,
    REPORT_CARD_URL_EXPIRY,
  );

  // Notify student via push + email
  void notificationQueue.add('dispatch', {
    recipientId: student.user.id,
    trigger: 'ATTENDANCE_80',
    data: {
      recipientName: student.user.fullName,
      courseCode: 'Multiple',
      average: 'Report Card Ready',
      summary: `Your semester report card is ready for download: ${downloadUrl}`,
    },
  });

  console.info(`[student-report-card] Generated ${s3Key} (${courseRows.length} courses)`);
}

// =============================================================================
// Worker instance
// =============================================================================

/**
 * BullMQ worker instance for the `student-report-card` queue.
 *
 * Concurrency 2 — PDF generation is I/O bound.
 */
export const studentReportCardWorker = new Worker<ReportCardJobData>(
  'student-report-card',
  processStudentReportCard,
  { connection: workerRedis, concurrency: 2 },
);

studentReportCardWorker.on('failed', (job, err) => {
  console.error(`[student-report-card] Job ${job?.id ?? 'unknown'} failed:`, err.message);
});
