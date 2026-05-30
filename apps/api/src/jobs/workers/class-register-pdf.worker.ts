/**
 * @file class-register-pdf.worker.ts
 * @module jobs/workers
 *
 * BullMQ worker for class register PDF generation.
 *
 * Generates a traditional-format landscape (A3) attendance register PDF for a
 * course section. Rows are sessions ordered by `scheduledStart`, columns are
 * enrolled students. Each cell shows the attendance status symbol:
 *   P = PRESENT  A = ABSENT  E = EXCUSED  L = LATE  M = MANUAL_OVERRIDE  PR = PENDING_REVIEW
 *
 * A per-student summary row shows the final attendance percentage. Manual override
 * cells include a footnote with the override justification.
 *
 * The PDF is SHA-256 checksummed, uploaded to S3 at
 * `registers/{courseSectionId}-{semesterId}.pdf`, then the lecturer and HOD
 * are notified with a pre-signed download link.
 *
 * Idempotent — if the S3 key already exists the job exits without regenerating.
 */

import { Worker, type Job } from 'bullmq';
import { Buffer } from 'buffer';
import PDFDocument from 'pdfkit';
import { redis } from '../../lib/redis.js';
import { prisma } from '../../lib/prisma.js';
import { computeSha256 } from '../../lib/checksum.js';
import { uploadToS3, getPresignedUrl, s3KeyExists } from '../../lib/s3.js';
import { notificationQueue, type ClassRegisterJobData } from '../queue.js';
import { env } from '../../config/env.js';

/** Pre-signed URL expiry for register downloads (1 hour). */
const REGISTER_URL_EXPIRY = 3600;

/** Maps `AttendanceStatus` values to the single-character symbols used in the register. */
const STATUS_SYMBOL: Record<string, string> = {
  PRESENT: 'P',
  ABSENT: 'A',
  EXCUSED: 'E',
  LATE: 'L',
  MANUAL_OVERRIDE: 'M',
  PENDING_REVIEW: 'PR',
};

// =============================================================================
// processClassRegisterPdf
// =============================================================================

/**
 * Processes a single `class-register-pdf` job.
 *
 * @param job - BullMQ job containing {@link ClassRegisterJobData}.
 * @returns A promise that resolves once the PDF is generated and uploaded.
 */
export async function processClassRegisterPdf(job: Job<ClassRegisterJobData>): Promise<void> {
  const { courseSectionId, semesterId } = job.data;

  const s3Key = `registers/${courseSectionId}-${semesterId}.pdf`;

  // Skip if already generated
  if (await s3KeyExists(env.AWS_S3_BUCKET_REPORTS, s3Key)) {
    console.info(`[class-register-pdf] Already exists: ${s3Key}`);
    return;
  }

  // Fetch course section with course and lecturer
  const section = await prisma.courseSection.findUnique({
    where: { id: courseSectionId },
    include: {
      course: { select: { code: true, title: true } },
      lecturer: { include: { user: { select: { fullName: true } } } },
      enrollments: {
        where: { droppedAt: null },
        include: { student: { include: { user: { select: { fullName: true } } } } },
        orderBy: { student: { matricNumber: 'asc' } },
      },
      sessions: {
        where: { status: { in: ['CLOSED', 'LOCKED'] } },
        orderBy: { scheduledStart: 'asc' },
        include: {
          venue: { select: { name: true } },
          attendanceRecords: {
            select: { studentId: true, status: true, enrollmentId: true },
          },
        },
      },
    },
  });
  if (!section) {
    console.warn(`[class-register-pdf] Section ${courseSectionId} not found`);
    return;
  }

  // Fetch manual override details for footnotes
  const overrides = await prisma.manualOverride.findMany({
    where: {
      attendanceRecord: {
        session: { courseSectionId },
        status: 'MANUAL_OVERRIDE',
      },
    },
    select: {
      justification: true,
      actorId: true,
      actorRole: true,
      attendanceRecord: {
        select: { studentId: true, session: { select: { scheduledStart: true } } },
      },
    },
  });

  const students = section.enrollments.map((e) => e.student);
  const sessions = section.sessions;

  // Build attendance matrix: matrix[sessionIdx][studentIdx] = statusSymbol
  const matrix: string[][] = sessions.map((session) => {
    return students.map((student) => {
      const record = session.attendanceRecords.find((r) => r.studentId === student.id);
      return STATUS_SYMBOL[record?.status ?? ''] ?? '—';
    });
  });

  // Compute per-student attendance percentage
  const studentPercentages = students.map((student) => {
    let present = 0;
    for (const session of sessions) {
      const record = session.attendanceRecords.find((r) => r.studentId === student.id);
      if (record && ['PRESENT', 'LATE', 'MANUAL_OVERRIDE', 'EXCUSED'].includes(record.status)) {
        present++;
      }
    }
    const pct = sessions.length > 0 ? ((present / sessions.length) * 100).toFixed(1) : '0.0';
    return `${pct}%`;
  });

  // Build footnotes for MANUAL_OVERRIDE cells
  const footnotes: string[] = overrides.map(
    (o) =>
      `M = Manual Override — ${o.actorRole} (${o.actorId.slice(0, 8)}) — ${o.justification.slice(0, 60)}`,
  );

  const courseLabel = `${section.course.code} — ${section.course.title}`;
  const lecturerName = section.lecturer?.user?.fullName ?? 'Unassigned';
  const staffId = section.lecturer?.staffId ?? 'N/A';
  const contentString = [
    courseLabel,
    lecturerName,
    staffId,
    ...sessions.map((s) => s.scheduledStart.toISOString()),
    ...students.map((s) => s.matricNumber),
    ...matrix.flat(),
  ].join('\n');
  const checksum = computeSha256(contentString);

  // Generate landscape A3 PDF
  const buffer = await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ layout: 'landscape', size: 'A3', margin: 30 });
    const chunks: Buffer[] = [];

    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Title
    doc
      .fontSize(14)
      .font('Helvetica-Bold')
      .text('KWASU — Class Attendance Register', { align: 'center' });
    doc.fontSize(10).font('Helvetica').text(`${courseLabel}`, { align: 'center' });
    doc.text(`Lecturer: ${lecturerName}  (${staffId})`, { align: 'center' });
    doc.moveDown(0.5);

    // Header row: session dates
    const colWidth = 35;
    const rowLabelWidth = 120;
    const startX = doc.page.margins.left;
    let y = doc.y;

    doc.fontSize(7).font('Helvetica-Bold');
    doc.text('Student / Session →', startX, y, { width: rowLabelWidth, align: 'left' });
    sessions.forEach((s, i) => {
      const label = s.scheduledStart.toISOString().slice(5, 10); // MM-DD
      doc.text(label, startX + rowLabelWidth + i * colWidth, y, {
        width: colWidth,
        align: 'center',
      });
    });
    y += 14;

    // Data rows
    doc.font('Helvetica').fontSize(7);
    students.forEach((student, si) => {
      const rowY = y + si * 13;
      doc.text(`${student.matricNumber}`, startX, rowY, { width: rowLabelWidth, align: 'left' });
      matrix[0]?.forEach((_, ji) => {
        const cell = matrix[ji]?.[si] ?? '—';
        doc.text(cell, startX + rowLabelWidth + ji * colWidth, rowY, {
          width: colWidth,
          align: 'center',
        });
      });
      // Percentage at end
      doc.text(
        studentPercentages[si] ?? '',
        startX + rowLabelWidth + sessions.length * colWidth,
        rowY,
        { width: 40, align: 'right' },
      );
    });

    y += students.length * 13 + 10;
    doc.y = y;

    // Footnotes
    if (footnotes.length > 0) {
      doc.moveDown(0.5).fontSize(7).font('Helvetica-Oblique');
      for (const note of footnotes) {
        doc.text(note);
      }
    }

    // Footer with checksum
    doc
      .fontSize(7)
      .font('Helvetica')
      .text(`SHA-256: ${checksum}`, doc.page.margins.left, doc.page.height - 25, {
        align: 'center',
        width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
      });

    doc.end();
  });

  // Upload and generate download URL
  await uploadToS3(env.AWS_S3_BUCKET_REPORTS, s3Key, buffer, 'application/pdf');
  const downloadUrl = await getPresignedUrl(env.AWS_S3_BUCKET_REPORTS, s3Key, REGISTER_URL_EXPIRY);

  // Notify lecturer
  if (section.lecturer) {
    void notificationQueue.add('dispatch', {
      recipientId: section.lecturer.userId,
      trigger: 'COURSE_AVERAGE_LOW',
      data: {
        recipientName: section.lecturer.user?.fullName ?? 'Lecturer',
        courseCode: section.course.code,
        average: 'Class Register Ready',
        summary: `Your class attendance register for ${courseLabel} is ready: ${downloadUrl}`,
      },
    });
  }

  // Notify HOD
  const hod = await prisma.user.findFirst({
    where: { role: 'HOD' },
    select: { id: true },
  });
  if (hod) {
    void notificationQueue.add('dispatch', {
      recipientId: hod.id,
      trigger: 'COURSE_AVERAGE_LOW',
      data: {
        recipientName: 'HOD',
        courseCode: section.course.code,
        average: 'Class Register Ready',
        summary: `Class attendance register for ${courseLabel} is ready: ${downloadUrl}`,
      },
    });
  }

  console.info(
    `[class-register-pdf] Generated ${s3Key} (${students.length} students, ${sessions.length} sessions)`,
  );
}

// =============================================================================
// Worker instance
// =============================================================================

/**
 * BullMQ worker instance for the `class-register-pdf` queue.
 *
 * Concurrency 2 — PDF generation is I/O bound.
 */
export const classRegisterPdfWorker = new Worker<ClassRegisterJobData>(
  'class-register-pdf',
  processClassRegisterPdf,
  { connection: redis, concurrency: 2 },
);

classRegisterPdfWorker.on('failed', (job, err) => {
  console.error(`[class-register-pdf] Job ${job?.id ?? 'unknown'} failed:`, err.message);
});
