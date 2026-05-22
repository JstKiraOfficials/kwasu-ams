/**
 * @file excuses.service.ts
 * @module modules/excuses
 *
 * Business logic for the excuse letter module.
 *
 * Responsibilities:
 * - `submitExcuse`     — Student submits an excuse with optional S3 document uploads.
 * - `listExcuses`      — Scope-aware paginated list of excuse letters.
 * - `getExcuseById`    — Fetch a single excuse with scope enforcement.
 * - `reviewExcuse`     — Lecturer approves or rejects an excuse.
 * - `appealExcuse`     — Student appeals a rejected excuse.
 * - `hodReviewExcuse`  — HOD makes the final decision on an appealed excuse.
 * - `getDocumentUrl`   — Generate a 15-minute pre-signed S3 URL for a document.
 *
 * State machine transitions are enforced via `validateTransition()` from
 * `excuse-state-machine.ts`. All state changes write `AuditLog` entries.
 *
 * On approval (`APPROVED` or `HOD_APPROVED`): `AttendanceRecord.status` is
 * updated to `EXCUSED` for sessions matching the absence dates.
 *
 * Abuse prevention: maximum 4 approved excuses per student per semester
 * (configurable via `semester.maxApprovedExcuses`).
 *
 * GPS coordinates are never stored — this service never touches coordinates.
 */

import { randomUUID } from 'crypto';
import { Buffer } from 'node:buffer';
import { type AuditAction, Prisma } from '@prisma/client';
import {
  type IExcuseLetter,
  type PaginatedResponse,
  Role,
  ExcuseStatus,
  ExcuseReason,
  AnomalyType,
} from '@kwasu-ams/types';
import { prisma } from '../../lib/prisma.js';
import { uploadToS3, getPresignedUrl } from '../../lib/s3.js';
import { env } from '../../config/env.js';
import { AppError } from '../../middleware/error-handler.js';
import { createAnomalyFlag } from '../anomalies/anomalies.service.js';
import { validateTransition } from './excuse-state-machine.js';
import {
  type SubmitExcuseInput,
  type ReviewExcuseInput,
  type AppealExcuseInput,
  type HodReviewExcuseInput,
  type ListExcusesQuery,
} from './excuses.schema.js';

// =============================================================================
// Constants
// =============================================================================

/** Maximum number of document files per excuse submission. */
const MAX_FILES = 3;

/** Maximum file size per document in bytes (5 MB). */
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

/** Allowed MIME types for excuse documents. */
const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;

/** Pre-signed URL expiry in seconds (15 minutes). */
const PRESIGNED_URL_EXPIRY_SECONDS = 15 * 60;

// =============================================================================
// Internal types
// =============================================================================

/**
 * Represents an uploaded file as received from the multipart handler.
 */
export interface UploadedFile {
  /** Original filename from the client. */
  filename: string;
  /** MIME type of the file. */
  mimetype: string;
  /** Raw file content as a Buffer. */
  buffer: Buffer;
  /** File size in bytes. */
  size: number;
}

// =============================================================================
// Internal helpers
// =============================================================================

/**
 * Writes an immutable audit log entry. Errors are swallowed.
 *
 * @param actorId    - UUID of the user performing the action.
 * @param actorRole  - Role string of the actor.
 * @param action     - The {@link AuditAction} enum value.
 * @param entityType - Human-readable entity name.
 * @param entityId   - Optional UUID of the affected entity.
 * @param metadata   - Optional free-form context object.
 * @returns A promise that resolves once the log is written (or silently fails).
 */
async function writeAuditLog(
  actorId: string,
  actorRole: string,
  action: AuditAction,
  entityType: string,
  entityId?: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId,
        actorRole: actorRole as never,
        action,
        entityType,
        entityId: entityId ?? null,
        metadata: metadata !== undefined ? (metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    });
  } catch {
    // Fire-and-forget — audit failures must not surface to the caller
  }
}

/**
 * Maps a MIME type to a file extension string.
 *
 * @param mimetype - MIME type string (e.g. `'application/pdf'`).
 * @returns File extension without leading dot (e.g. `'pdf'`).
 */
function mimeToExt(mimetype: string): string {
  const map: Record<string, string> = {
    'application/pdf': 'pdf',
    'image/jpeg': 'jpg',
    'image/png': 'png',
  };
  return map[mimetype] ?? 'bin';
}

/**
 * Counts the number of approved excuses for a student in the active semester.
 *
 * @param studentId - UUID of the `Student` record.
 * @returns The count of approved excuses in the current semester.
 */
async function countApprovedExcuses(studentId: string): Promise<number> {
  // Find the active semester
  const activeSemester = await prisma.semester.findFirst({
    where: { isActive: true },
    select: { id: true, maxApprovedExcuses: true },
  });
  if (!activeSemester) return 0;

  return prisma.excuseLetter.count({
    where: {
      studentId,
      status: { in: ['APPROVED', 'HOD_APPROVED'] },
      courseSection: { semesterId: activeSemester.id },
    },
  });
}

/**
 * Updates `AttendanceRecord` status to `EXCUSED` for sessions matching the
 * given absence dates and student. Creates records if none exist.
 *
 * @param studentId       - UUID of the `Student` record.
 * @param courseSectionId - UUID of the course section.
 * @param absenceDates    - Array of absence date strings (ISO 8601).
 * @returns A promise that resolves once all records are updated.
 */
async function markAttendanceExcused(
  studentId: string,
  courseSectionId: string,
  absenceDates: Date[],
): Promise<void> {
  // Find sessions in this course section that fall on the absence dates
  const sessions = await prisma.courseSession.findMany({
    where: {
      courseSectionId,
      scheduledStart: {
        in: absenceDates,
      },
    },
    select: { id: true },
  });

  // Also find sessions where scheduledStart date matches (day-level comparison)
  const absenceDateStrings = absenceDates.map((d) => d.toISOString().split('T')[0]);
  const allSessions = await prisma.courseSession.findMany({
    where: { courseSectionId },
    select: { id: true, scheduledStart: true },
  });
  const matchingSessions = allSessions.filter((s) => {
    const sessionDate = s.scheduledStart.toISOString().split('T')[0];
    return absenceDateStrings.includes(sessionDate!);
  });

  const sessionIds = [
    ...new Set([...sessions.map((s) => s.id), ...matchingSessions.map((s) => s.id)]),
  ];

  if (sessionIds.length === 0) return;

  // Find enrollment for upsert
  const enrollment = await prisma.courseEnrollment.findFirst({
    where: { studentId, courseSectionId },
    select: { id: true },
  });

  for (const sessionId of sessionIds) {
    const existing = await prisma.attendanceRecord.findUnique({
      where: { studentId_sessionId: { studentId, sessionId } },
    });

    if (existing) {
      await prisma.attendanceRecord.update({
        where: { studentId_sessionId: { studentId, sessionId } },
        data: { status: 'EXCUSED' },
      });
    } else if (enrollment) {
      await prisma.attendanceRecord.create({
        data: {
          studentId,
          sessionId,
          enrollmentId: enrollment.id,
          status: 'EXCUSED',
        },
      });
    }
  }
}

/**
 * Checks for the `REPEATED_DAY_PATTERN` anomaly after an excuse is approved.
 * If the student has 3+ approved excuses on the same weekday in the current
 * semester, creates a `REPEATED_DAY_PATTERN` anomaly flag.
 *
 * @param studentId   - UUID of the `Student` record.
 * @param absenceDates - Array of absence dates from the newly approved excuse.
 * @param actorId      - UUID of the actor approving the excuse (for audit trail).
 * @returns A promise that resolves once the check completes.
 */
async function checkRepeatedDayPattern(
  studentId: string,
  absenceDates: Date[],
  actorId: string,
): Promise<void> {
  const activeSemester = await prisma.semester.findFirst({
    where: { isActive: true },
    select: { id: true },
  });
  if (!activeSemester) return;

  // Get all approved excuses for this student this semester
  const approvedExcuses = await prisma.excuseLetter.findMany({
    where: {
      studentId,
      status: { in: ['APPROVED', 'HOD_APPROVED'] },
      courseSection: { semesterId: activeSemester.id },
    },
    select: { absenceDates: true },
  });

  // Count occurrences per weekday (0=Sun, 1=Mon, ..., 6=Sat)
  const weekdayCounts: Record<number, number> = {};
  for (const excuse of approvedExcuses) {
    for (const date of excuse.absenceDates) {
      const day = new Date(date).getDay();
      weekdayCounts[day] = (weekdayCounts[day] ?? 0) + 1;
    }
  }

  // Check if any weekday from the new excuse now has 3+ occurrences
  for (const date of absenceDates) {
    const day = new Date(date).getDay();
    if ((weekdayCounts[day] ?? 0) >= 3) {
      void createAnomalyFlag(
        {
          studentId,
          flagType: AnomalyType.REPEATED_DAY_PATTERN,
          description: `Student has 3+ approved excuses on the same weekday (day ${day}) in the current semester.`,
        },
        actorId,
      );
      break; // One flag per approval is sufficient
    }
  }
}

// =============================================================================
// submitExcuse
// =============================================================================

/**
 * Submits a new excuse letter for a student.
 *
 * Validates file count and size, uploads documents to S3, creates the
 * `ExcuseLetter` record, and writes an audit log entry.
 *
 * @param studentUserId - UUID of the authenticated `User` (not the `Student` record).
 * @param data          - Validated submission payload from {@link SubmitExcuseSchema}.
 * @param files         - Array of uploaded files (max 3, 5MB each).
 * @returns The created {@link IExcuseLetter} record.
 * @throws {AppError} `NOT_FOUND` (404)       — student or course section not found.
 * @throws {AppError} `FORBIDDEN` (403)       — student not enrolled in the course section.
 * @throws {AppError} `VALIDATION_ERROR` (400) — file count/size/type violation or OTHER reason without explanation.
 */
export async function submitExcuse(
  studentUserId: string,
  data: SubmitExcuseInput,
  files: UploadedFile[],
): Promise<IExcuseLetter> {
  // ── Step 1: Resolve student ──────────────────────────────────────────────
  const student = await prisma.student.findUnique({
    where: { userId: studentUserId },
    select: { id: true },
  });
  if (!student) {
    throw new AppError('NOT_FOUND', 'Student not found.', 404);
  }

  // ── Step 2: Verify enrollment ────────────────────────────────────────────
  const enrollment = await prisma.courseEnrollment.findFirst({
    where: { studentId: student.id, courseSectionId: data.courseSectionId },
  });
  if (!enrollment) {
    throw new AppError('FORBIDDEN', 'You are not enrolled in this course section.', 403);
  }

  // ── Step 3: Validate OTHER reason ────────────────────────────────────────
  if (data.reason === ExcuseReason.OTHER) {
    if (!data.otherExplanation || data.otherExplanation.length < 30) {
      throw new AppError(
        'VALIDATION_ERROR',
        'otherExplanation must be at least 30 characters when reason is OTHER.',
        400,
        'otherExplanation',
      );
    }
  }

  // ── Step 4: Validate files ───────────────────────────────────────────────
  if (files.length > MAX_FILES) {
    throw new AppError(
      'VALIDATION_ERROR',
      `Maximum ${MAX_FILES} documents allowed per excuse.`,
      400,
      'files',
    );
  }
  for (const file of files) {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new AppError(
        'VALIDATION_ERROR',
        `File "${file.filename}" exceeds the 5MB size limit.`,
        400,
        'files',
      );
    }
    if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(file.mimetype)) {
      throw new AppError(
        'VALIDATION_ERROR',
        `File "${file.filename}" has an unsupported type. Allowed: PDF, JPEG, PNG.`,
        400,
        'files',
      );
    }
  }

  // ── Step 5: Upload files to S3 ───────────────────────────────────────────
  const documentS3Keys: string[] = [];
  for (const file of files) {
    const ext = mimeToExt(file.mimetype);
    const key = `excuses/${student.id}/${randomUUID()}.${ext}`;
    await uploadToS3(env.AWS_S3_BUCKET_EXCUSES, key, file.buffer, file.mimetype);
    documentS3Keys.push(key);
  }

  // ── Step 6: Create ExcuseLetter ──────────────────────────────────────────
  const excuse = await prisma.excuseLetter.create({
    data: {
      studentId: student.id,
      courseSectionId: data.courseSectionId,
      absenceDates: data.absenceDates.map((d) => new Date(d)),
      reason: data.reason,
      otherExplanation: data.otherExplanation ?? null,
      documentS3Keys,
      status: ExcuseStatus.SUBMITTED,
    },
  });

  // ── Step 7: Write audit log ──────────────────────────────────────────────
  void writeAuditLog(studentUserId, 'STUDENT', 'EXCUSE_SUBMITTED', 'ExcuseLetter', excuse.id, {
    courseSectionId: data.courseSectionId,
    reason: data.reason,
    fileCount: files.length,
  });

  return excuse as unknown as IExcuseLetter;
}

// =============================================================================
// listExcuses
// =============================================================================

/**
 * Returns a paginated, scope-aware list of excuse letters.
 *
 * Scope rules:
 * - `STUDENT` — only their own excuses.
 * - `LECTURER` — excuses for their assigned course sections.
 * - `HOD` — excuses in `APPEAL_SUBMITTED` status for their department.
 * - `SUPER_ADMIN`, `ACADEMIC_AFFAIRS` — all excuses.
 *
 * @param query        - Validated query params from {@link ListExcusesQuerySchema}.
 * @param actorRole    - Role of the requesting user.
 * @param actorUserId  - UUID of the requesting user.
 * @param actorScopeId - Department UUID for HOD scope, or `null`.
 * @returns Paginated list of {@link IExcuseLetter} records.
 */
export async function listExcuses(
  query: ListExcusesQuery,
  actorRole: Role,
  actorUserId: string,
  actorScopeId: string | null,
): Promise<PaginatedResponse<IExcuseLetter>> {
  const { page, pageSize, status, courseSectionId } = query;
  const skip = (page - 1) * pageSize;

  const where: Prisma.ExcuseLetterWhereInput = {};

  if (actorRole === Role.STUDENT) {
    const student = await prisma.student.findUnique({
      where: { userId: actorUserId },
      select: { id: true },
    });
    if (!student) throw new AppError('NOT_FOUND', 'Student not found.', 404);
    where.studentId = student.id;
  } else if (actorRole === Role.LECTURER) {
    const lecturer = await prisma.lecturer.findUnique({
      where: { userId: actorUserId },
      select: { id: true },
    });
    if (lecturer) {
      where.courseSection = { lecturerId: lecturer.id };
    }
  } else if (actorRole === Role.HOD && actorScopeId !== null) {
    where.courseSection = { course: { departmentId: actorScopeId } };
    where.status = ExcuseStatus.APPEAL_SUBMITTED;
  }

  if (status !== undefined && actorRole !== Role.HOD) where.status = status;
  if (courseSectionId !== undefined) where.courseSectionId = courseSectionId;

  const [excuses, total] = await Promise.all([
    prisma.excuseLetter.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: {
        student: { include: { user: { select: { fullName: true } } } },
        courseSection: { include: { course: { select: { code: true, title: true } } } },
      },
    }),
    prisma.excuseLetter.count({ where }),
  ]);

  return {
    data: excuses as unknown as IExcuseLetter[],
    meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  };
}

// =============================================================================
// getExcuseById
// =============================================================================

/**
 * Fetches a single excuse letter by UUID with scope enforcement.
 *
 * @param id          - UUID of the `ExcuseLetter` to fetch.
 * @param actorRole   - Role of the requesting user.
 * @param actorUserId - UUID of the requesting user.
 * @returns The {@link IExcuseLetter} record.
 * @throws {AppError} `NOT_FOUND` (404) — excuse does not exist.
 * @throws {AppError} `FORBIDDEN` (403) — actor does not have access to this excuse.
 */
export async function getExcuseById(
  id: string,
  actorRole: Role,
  actorUserId: string,
): Promise<IExcuseLetter> {
  const excuse = await prisma.excuseLetter.findUnique({
    where: { id },
    include: {
      student: { include: { user: { select: { fullName: true } } } },
      courseSection: { include: { course: { select: { code: true, title: true } } } },
    },
  });
  if (!excuse) throw new AppError('NOT_FOUND', 'Excuse letter not found.', 404);

  // Scope check for STUDENT
  if (actorRole === Role.STUDENT) {
    const student = await prisma.student.findUnique({
      where: { userId: actorUserId },
      select: { id: true },
    });
    if (!student || excuse.studentId !== student.id) {
      throw new AppError('FORBIDDEN', 'You do not have access to this excuse letter.', 403);
    }
  }

  return excuse as unknown as IExcuseLetter;
}

// =============================================================================
// reviewExcuse
// =============================================================================

/**
 * Lecturer approves or rejects an excuse letter.
 *
 * If the excuse is still `SUBMITTED`, it is auto-transitioned to `UNDER_REVIEW`
 * before the decision is applied. On `APPROVED`, the `AttendanceRecord` is
 * updated to `EXCUSED` and the `REPEATED_DAY_PATTERN` check runs.
 *
 * @param id      - UUID of the `ExcuseLetter` to review.
 * @param data    - Validated review payload from {@link ReviewExcuseSchema}.
 * @param actorId - UUID of the authenticated lecturer/admin.
 * @returns The updated {@link IExcuseLetter} record.
 * @throws {AppError} `NOT_FOUND` (404)           — excuse does not exist.
 * @throws {AppError} `CONFLICT` (409)            — invalid state transition.
 * @throws {AppError} `EXCUSE_LIMIT_REACHED` (400) — student has reached the approved excuse limit.
 */
export async function reviewExcuse(
  id: string,
  data: ReviewExcuseInput,
  actorId: string,
): Promise<IExcuseLetter> {
  const excuse = await prisma.excuseLetter.findUnique({
    where: { id },
    include: { student: { select: { id: true } } },
  });
  if (!excuse) throw new AppError('NOT_FOUND', 'Excuse letter not found.', 404);

  // Auto-transition SUBMITTED → UNDER_REVIEW if needed
  let currentStatus = excuse.status as ExcuseStatus;
  if (currentStatus === ExcuseStatus.SUBMITTED) {
    await prisma.excuseLetter.update({
      where: { id },
      data: { status: ExcuseStatus.UNDER_REVIEW },
    });
    currentStatus = ExcuseStatus.UNDER_REVIEW;
  }

  const targetStatus = data.decision === 'APPROVED' ? ExcuseStatus.APPROVED : ExcuseStatus.REJECTED;
  validateTransition(currentStatus, targetStatus);

  const now = new Date();

  if (data.decision === 'APPROVED') {
    // Abuse prevention check
    const approvedCount = await countApprovedExcuses(excuse.student.id);
    const activeSemester = await prisma.semester.findFirst({
      where: { isActive: true },
      select: { maxApprovedExcuses: true },
    });
    const limit = activeSemester?.maxApprovedExcuses ?? 4;
    if (approvedCount >= limit) {
      throw new AppError(
        'EXCUSE_LIMIT_REACHED',
        'Maximum approved excuses per semester reached.',
        400,
      );
    }

    // Update attendance records
    await markAttendanceExcused(excuse.student.id, excuse.courseSectionId, excuse.absenceDates);

    // Check for repeated day pattern
    void checkRepeatedDayPattern(excuse.student.id, excuse.absenceDates, actorId);
  }

  const updated = await prisma.excuseLetter.update({
    where: { id },
    data: {
      status: targetStatus,
      lecturerComment: data.comment,
      lecturerReviewedById: actorId,
      lecturerReviewedAt: now,
    },
  });

  const auditAction = data.decision === 'APPROVED' ? 'EXCUSE_APPROVED' : 'EXCUSE_REJECTED';
  void writeAuditLog(actorId, 'LECTURER', auditAction, 'ExcuseLetter', id, {
    decision: data.decision,
  });

  return updated as unknown as IExcuseLetter;
}

// =============================================================================
// appealExcuse
// =============================================================================

/**
 * Student appeals a rejected excuse letter.
 *
 * Validates the `REJECTED → APPEAL_SUBMITTED` transition and verifies the
 * student owns the excuse before updating.
 *
 * @param id            - UUID of the `ExcuseLetter` to appeal.
 * @param data          - Validated appeal payload from {@link AppealExcuseSchema}.
 * @param studentUserId - UUID of the authenticated student `User`.
 * @returns The updated {@link IExcuseLetter} record.
 * @throws {AppError} `NOT_FOUND` (404) — excuse does not exist.
 * @throws {AppError} `FORBIDDEN` (403) — student does not own this excuse.
 * @throws {AppError} `CONFLICT` (409)  — invalid state transition.
 */
export async function appealExcuse(
  id: string,
  data: AppealExcuseInput,
  studentUserId: string,
): Promise<IExcuseLetter> {
  const excuse = await prisma.excuseLetter.findUnique({
    where: { id },
    include: { student: { include: { user: { select: { id: true } } } } },
  });
  if (!excuse) throw new AppError('NOT_FOUND', 'Excuse letter not found.', 404);

  if (excuse.student.user.id !== studentUserId) {
    throw new AppError('FORBIDDEN', 'You do not have access to this excuse letter.', 403);
  }

  validateTransition(excuse.status as ExcuseStatus, ExcuseStatus.APPEAL_SUBMITTED);

  const updated = await prisma.excuseLetter.update({
    where: { id },
    data: {
      status: ExcuseStatus.APPEAL_SUBMITTED,
      appealReason: data.appealReason,
      appealSubmittedAt: new Date(),
    },
  });

  void writeAuditLog(studentUserId, 'STUDENT', 'EXCUSE_APPEALED', 'ExcuseLetter', id, {
    appealReason: data.appealReason,
  });

  return updated as unknown as IExcuseLetter;
}

// =============================================================================
// hodReviewExcuse
// =============================================================================

/**
 * HOD makes the final decision on an appealed excuse letter.
 *
 * On `HOD_APPROVED`, updates `AttendanceRecord.status` to `EXCUSED` and
 * runs the `REPEATED_DAY_PATTERN` check.
 *
 * @param id      - UUID of the `ExcuseLetter` to review.
 * @param data    - Validated HOD review payload from {@link HodReviewExcuseSchema}.
 * @param actorId - UUID of the authenticated HOD/admin.
 * @returns The updated {@link IExcuseLetter} record.
 * @throws {AppError} `NOT_FOUND` (404)           — excuse does not exist.
 * @throws {AppError} `CONFLICT` (409)            — invalid state transition.
 * @throws {AppError} `EXCUSE_LIMIT_REACHED` (400) — student has reached the approved excuse limit.
 */
export async function hodReviewExcuse(
  id: string,
  data: HodReviewExcuseInput,
  actorId: string,
): Promise<IExcuseLetter> {
  const excuse = await prisma.excuseLetter.findUnique({
    where: { id },
    include: { student: { select: { id: true } } },
  });
  if (!excuse) throw new AppError('NOT_FOUND', 'Excuse letter not found.', 404);

  const targetStatus =
    data.decision === 'HOD_APPROVED' ? ExcuseStatus.HOD_APPROVED : ExcuseStatus.HOD_REJECTED;
  validateTransition(excuse.status as ExcuseStatus, targetStatus);

  const now = new Date();

  if (data.decision === 'HOD_APPROVED') {
    const approvedCount = await countApprovedExcuses(excuse.student.id);
    const activeSemester = await prisma.semester.findFirst({
      where: { isActive: true },
      select: { maxApprovedExcuses: true },
    });
    const limit = activeSemester?.maxApprovedExcuses ?? 4;
    if (approvedCount >= limit) {
      throw new AppError(
        'EXCUSE_LIMIT_REACHED',
        'Maximum approved excuses per semester reached.',
        400,
      );
    }

    await markAttendanceExcused(excuse.student.id, excuse.courseSectionId, excuse.absenceDates);

    void checkRepeatedDayPattern(excuse.student.id, excuse.absenceDates, actorId);
  }

  const updated = await prisma.excuseLetter.update({
    where: { id },
    data: {
      status: targetStatus,
      hodComment: data.comment,
      hodReviewedById: actorId,
      hodReviewedAt: now,
    },
  });

  const auditAction =
    data.decision === 'HOD_APPROVED' ? 'HOD_EXCUSE_APPROVED' : 'HOD_EXCUSE_REJECTED';
  void writeAuditLog(actorId, 'HOD', auditAction, 'ExcuseLetter', id, {
    decision: data.decision,
  });

  return updated as unknown as IExcuseLetter;
}

// =============================================================================
// getDocumentUrl
// =============================================================================

/**
 * Generates a 15-minute pre-signed S3 URL for a document attached to an excuse.
 *
 * Verifies the `key` is actually stored on the excuse before generating the URL
 * to prevent unauthorised access to arbitrary S3 keys.
 *
 * @param id          - UUID of the `ExcuseLetter`.
 * @param key         - S3 object key to generate a URL for.
 * @param actorRole   - Role of the requesting user.
 * @param actorUserId - UUID of the requesting user.
 * @returns An object with the pre-signed `url` and its `expiresAt` timestamp.
 * @throws {AppError} `NOT_FOUND` (404) — excuse or key not found.
 * @throws {AppError} `FORBIDDEN` (403) — actor does not have access to this excuse.
 */
export async function getDocumentUrl(
  id: string,
  key: string,
  actorRole: Role,
  actorUserId: string,
): Promise<{ url: string; expiresAt: string }> {
  const excuse = await getExcuseById(id, actorRole, actorUserId);

  if (!excuse.documentS3Keys.includes(key)) {
    throw new AppError('NOT_FOUND', 'Document not found on this excuse letter.', 404);
  }

  const url = await getPresignedUrl(env.AWS_S3_BUCKET_EXCUSES, key, PRESIGNED_URL_EXPIRY_SECONDS);

  const expiresAt = new Date(Date.now() + PRESIGNED_URL_EXPIRY_SECONDS * 1000).toISOString();
  return { url, expiresAt };
}
