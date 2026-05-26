/**
 * @file nuc-package.service.ts
 * @module modules/reports
 *
 * NUC accreditation report package generation service.
 *
 * Generates a bundled PDF containing:
 * 1. Attendance compliance proof per course (≥ 75% compliance rate).
 * 2. Lecturer class-holding records with timestamps.
 * 3. Student eligibility lists formatted to NUC standards.
 *
 * The bundle is signed with a SHA-256 checksum and uploaded to S3.
 */

import { prisma } from '../../lib/prisma.js';
import { generatePdf } from '../../lib/pdf-generator.js';
import { uploadToS3, getPresignedUrl } from '../../lib/s3.js';
import { env } from '../../config/env.js';
import { computeAttendancePercentage } from '@kwasu-ams/utils';

/** Pre-signed URL expiry for NUC package downloads in seconds (24 hours). */
const NUC_URL_EXPIRY = 86400;

/**
 * Generates a NUC accreditation report package for a semester.
 *
 * Bundles attendance compliance, lecturer records, and eligibility lists
 * into a single checksummed PDF. Uploads to S3 and returns a 24-hour
 * pre-signed download URL.
 *
 * @param semesterId - UUID of the `Semester` to generate the package for.
 * @param actorId    - UUID of the user requesting the package (for S3 key).
 * @returns An object with `downloadUrl` (pre-signed S3 URL) and `checksum` (SHA-256 hex).
 */
export async function generateNucPackage(
  semesterId: string,
  actorId: string,
): Promise<{ downloadUrl: string; checksum: string }> {
  const semester = await prisma.semester.findUnique({
    where: { id: semesterId },
    select: { type: true, academicSession: { select: { name: true } } },
  });

  const semesterLabel = semester
    ? `${semester.academicSession.name} — ${semester.type}`
    : semesterId;

  // Section 1: Attendance compliance per course
  const sections = await prisma.courseSection.findMany({
    where: { semesterId },
    select: {
      course: { select: { code: true, title: true } },
      sessions: {
        where: { status: { in: ['CLOSED', 'LOCKED'] } },
        select: { attendanceRecords: { select: { status: true } } },
      },
      enrollments: { select: { id: true } },
    },
  });

  const complianceLines = sections.map((cs) => {
    let present = 0;
    let total = 0;
    for (const session of cs.sessions) {
      for (const record of session.attendanceRecords) {
        total++;
        if (['PRESENT', 'LATE', 'MANUAL_OVERRIDE', 'EXCUSED'].includes(record.status)) present++;
      }
    }
    const rate = computeAttendancePercentage(present, total);
    const compliant = rate >= 75 ? 'COMPLIANT' : 'NON-COMPLIANT';
    return `${cs.course.code} — ${cs.course.title}: ${rate.toFixed(2)}% [${compliant}]`;
  });

  // Section 2: Lecturer records
  const lecturerRecords = await prisma.courseSession.findMany({
    where: { courseSection: { semesterId }, status: { in: ['CLOSED', 'LOCKED'] } },
    select: {
      actualStart: true,
      actualEnd: true,
      lecturer: { include: { user: { select: { fullName: true } } } },
      courseSection: { select: { course: { select: { code: true } } } },
    },
    orderBy: { actualStart: 'asc' },
    take: 200,
  });

  const lecturerLines = lecturerRecords.map(
    (s) =>
      `${s.courseSection.course.code} — ${s.lecturer.user.fullName}: ${s.actualStart?.toISOString() ?? 'N/A'} → ${s.actualEnd?.toISOString() ?? 'N/A'}`,
  );

  // Section 3: Eligibility summary
  const [eligible, barred, conditional] = await Promise.all([
    prisma.examEligibility.count({ where: { semesterId, status: 'ELIGIBLE' } }),
    prisma.examEligibility.count({ where: { semesterId, status: 'BARRED' } }),
    prisma.examEligibility.count({ where: { semesterId, status: 'CONDITIONAL' } }),
  ]);

  const { buffer, checksum } = await generatePdf(`NUC Accreditation Report — ${semesterLabel}`, [
    {
      heading: '1. Attendance Compliance by Course',
      body: complianceLines.join('\n') || 'No course data available.',
    },
    {
      heading: '2. Lecturer Class-Holding Records',
      body: lecturerLines.slice(0, 50).join('\n') || 'No session records available.',
    },
    {
      heading: '3. Student Eligibility Summary',
      body: `Eligible: ${eligible}\nBarred: ${barred}\nConditional: ${conditional}`,
    },
  ]);

  const timestamp = Date.now();
  const s3Key = `reports/${actorId}/${timestamp}-nuc-package.pdf`;
  await uploadToS3(env.AWS_S3_BUCKET_REPORTS, s3Key, buffer, 'application/pdf');

  const downloadUrl = await getPresignedUrl(env.AWS_S3_BUCKET_REPORTS, s3Key, NUC_URL_EXPIRY);

  return { downloadUrl, checksum };
}
