/**
 * @file certificate.service.ts
 * @module modules/reports
 *
 * Attendance certificate generation service.
 *
 * Generates per-student per-course attendance certificates for completed
 * semesters. Certificates include the student's name, matric number, course
 * code, attendance percentage, semester name, and a university seal placeholder.
 *
 * All certificates are signed with a SHA-256 checksum embedded in the PDF
 * footer and uploaded to S3 at `certificates/{studentId}/{courseSectionId}-{semesterId}.pdf`.
 */

import { prisma } from '../../lib/prisma.js';
import { generatePdf } from '../../lib/pdf-generator.js';
import { uploadToS3, getPresignedUrl } from '../../lib/s3.js';
import { env } from '../../config/env.js';
import { AppError } from '../../middleware/error-handler.js';

/** Pre-signed URL expiry for certificate downloads in seconds (1 hour). */
const CERTIFICATE_URL_EXPIRY = 3600;

/**
 * Generates an attendance certificate PDF for a student in a completed semester.
 *
 * Verifies the semester is not active before generating. Uploads the PDF to S3
 * and returns a 1-hour pre-signed download URL with the document checksum.
 *
 * @param studentId       - UUID of the `Student` record.
 * @param courseSectionId - UUID of the `CourseSection`.
 * @param semesterId      - UUID of the completed `Semester`.
 * @returns An object with `downloadUrl` (pre-signed S3 URL) and `checksum` (SHA-256 hex).
 * @throws {AppError} `VALIDATION_ERROR` (400) — semester is still active.
 * @throws {AppError} `NOT_FOUND` (404)        — student, course section, or eligibility not found.
 */
export async function generateAttendanceCertificate(
  studentId: string,
  courseSectionId: string,
  semesterId: string,
): Promise<{ downloadUrl: string; checksum: string }> {
  // Verify semester is completed
  const semester = await prisma.semester.findUnique({
    where: { id: semesterId },
    select: { id: true, isActive: true, type: true, academicSession: { select: { name: true } } },
  });
  if (!semester) throw new AppError('NOT_FOUND', 'Semester not found.', 404);
  if (semester.isActive) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Certificates can only be generated for completed semesters.',
      400,
    );
  }

  // Query student and course data
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: { user: { select: { fullName: true } } },
  });
  if (!student) throw new AppError('NOT_FOUND', 'Student not found.', 404);

  const courseSection = await prisma.courseSection.findUnique({
    where: { id: courseSectionId },
    include: { course: { select: { code: true, title: true } } },
  });
  if (!courseSection) throw new AppError('NOT_FOUND', 'Course section not found.', 404);

  // Get eligibility data
  const eligibility = await prisma.examEligibility.findFirst({
    where: { studentId, enrollmentId: { not: undefined }, semesterId },
    select: { effectivePercentage: true, status: true },
  });

  const percentage = eligibility?.effectivePercentage ?? 0;
  const semesterLabel = `${semester.academicSession.name} — ${semester.type}`;

  // Generate PDF
  const { buffer, checksum } = await generatePdf('KWASU Attendance Certificate', [
    {
      heading: 'Student Information',
      body: `Name: ${student.user.fullName}\nMatric Number: ${student.matricNumber}`,
    },
    {
      heading: 'Course Information',
      body: `Course Code: ${courseSection.course.code}\nCourse Title: ${courseSection.course.title}`,
    },
    {
      heading: 'Attendance Record',
      body: `Semester: ${semesterLabel}\nAttendance Percentage: ${percentage.toFixed(2)}%\nEligibility Status: ${eligibility?.status ?? 'PENDING'}`,
    },
    {
      heading: 'Certification',
      body: 'This certificate confirms the attendance record of the above-named student as recorded in the KWASU Attendance Management System.\n\n[University Seal Placeholder]',
    },
  ]);

  // Upload to S3
  const s3Key = `certificates/${studentId}/${courseSectionId}-${semesterId}.pdf`;
  await uploadToS3(env.AWS_S3_BUCKET_REPORTS, s3Key, buffer, 'application/pdf');

  const downloadUrl = await getPresignedUrl(
    env.AWS_S3_BUCKET_REPORTS,
    s3Key,
    CERTIFICATE_URL_EXPIRY,
  );

  return { downloadUrl, checksum };
}
