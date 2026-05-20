/**
 * @file sessions.service.ts
 * @module modules/sessions
 *
 * Business logic for session CRUD operations.
 *
 * Responsibilities:
 * - Creating sessions with lecturer/venue validation
 * - Scope-aware listing (LECTURER sees own sessions; HOD sees department sessions)
 * - Fetching session details with attendance counts by status
 * - Auto-creating sessions from timetable entries
 *
 * Lifecycle operations (open, close, lock) live in
 * {@link session-lifecycle.service.ts}.
 *
 * Phase 27 note: Replace direct `prisma.auditLog.create` calls with
 * `auditLogQueue.add()` once BullMQ is wired up.
 */

import { type AuditAction, Prisma } from '@prisma/client';
import { type ICourseSessionPublic, type PaginatedResponse, Role } from '@kwasu-ams/types';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../middleware/error-handler.js';
import { type CreateSessionInput, type ListSessionsQuery } from './sessions.schema.js';

// =============================================================================
// Internal helpers
// =============================================================================

/**
 * Writes an immutable audit log entry via a direct Prisma call.
 * Errors are swallowed — audit failures must never surface to the caller.
 *
 * @param actorId    - UUID of the user performing the action.
 * @param actorRole  - Role string of the actor.
 * @param action     - The {@link AuditAction} enum value.
 * @param entityType - Human-readable entity name, e.g. `"CourseSession"`.
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

// =============================================================================
// Prisma select — ICourseSessionPublic fields
// =============================================================================

/**
 * Prisma `select` that returns all `ICourseSessionPublic` fields plus
 * nested course section and venue details for rich responses.
 * `qrToken` and `alphanumericCode` are intentionally excluded.
 */
const SESSION_SELECT = {
  id: true,
  courseSectionId: true,
  venueId: true,
  lecturerId: true,
  scheduledStart: true,
  scheduledEnd: true,
  actualStart: true,
  actualEnd: true,
  status: true,
  qrTokenExpiresAt: true,
  codeExpiresAt: true,
  isMakeUp: true,
  overrideWindowEnd: true,
  createdAt: true,
  updatedAt: true,
  courseSection: {
    select: {
      sectionLabel: true,
      course: { select: { code: true, title: true } },
    },
  },
  venue: { select: { name: true, buildingName: true } },
} as const;

// =============================================================================
// createSession
// =============================================================================

/**
 * Creates a new course session with `status: 'SCHEDULED'`.
 *
 * Validates that:
 * - The `CourseSection` exists.
 * - The `Venue` exists and is active.
 * - The `lecturerId` is assigned to the section (bypassed for SUPER_ADMIN/HOD).
 *
 * Writes a `SESSION_CREATED` AuditLog entry on success.
 *
 * @param data       - Validated creation payload from {@link CreateSessionSchema}.
 * @param lecturerId - UUID of the `Lecturer` record creating the session.
 * @param actorId    - UUID of the actor (for audit trail).
 * @param actorRole  - Role of the actor (used for lecturer assignment bypass).
 * @returns The created session as {@link ICourseSessionPublic}.
 * @throws {AppError} `NOT_FOUND` (404) — course section or venue does not exist.
 * @throws {AppError} `VALIDATION_ERROR` (400) — venue is inactive.
 * @throws {AppError} `FORBIDDEN` (403) — lecturer is not assigned to this section.
 */
export async function createSession(
  data: CreateSessionInput,
  lecturerId: string,
  actorId: string,
  actorRole: Role,
): Promise<ICourseSessionPublic> {
  // Verify course section exists
  const section = await prisma.courseSection.findUnique({
    where: { id: data.courseSectionId },
    select: { id: true, lecturerId: true },
  });
  if (!section) {
    throw new AppError('NOT_FOUND', 'Course section not found.', 404, 'courseSectionId');
  }

  // Verify venue exists and is active
  const venue = await prisma.venue.findUnique({
    where: { id: data.venueId },
    select: { id: true, isActive: true },
  });
  if (!venue) {
    throw new AppError('NOT_FOUND', 'Venue not found.', 404, 'venueId');
  }
  if (!venue.isActive) {
    throw new AppError('VALIDATION_ERROR', 'Venue is not active.', 400, 'venueId');
  }

  // Verify lecturer is assigned to this section (bypass for SUPER_ADMIN and HOD)
  if (actorRole !== Role.SUPER_ADMIN && actorRole !== Role.HOD) {
    if (section.lecturerId !== lecturerId) {
      throw new AppError('FORBIDDEN', 'You are not assigned to this course section.', 403);
    }
  }

  const session = await prisma.courseSession.create({
    data: {
      courseSectionId: data.courseSectionId,
      venueId: data.venueId,
      lecturerId,
      scheduledStart: new Date(data.scheduledStart),
      scheduledEnd: new Date(data.scheduledEnd),
      isMakeUp: data.isMakeUp,
      status: 'SCHEDULED',
    },
    select: SESSION_SELECT,
  });

  if (data.isMakeUp) {
    // TODO Phase 25: dispatch make-up session notification to all enrolled students
  }

  void writeAuditLog(actorId, actorRole, 'SESSION_CREATED', 'CourseSession', session.id, {
    courseSectionId: data.courseSectionId,
    isMakeUp: data.isMakeUp,
  });

  return session as unknown as ICourseSessionPublic;
}

// =============================================================================
// listSessions
// =============================================================================

/**
 * Returns a paginated, scope-aware list of sessions.
 *
 * Scope rules (enforced at the Prisma query level):
 * - `LECTURER` — only sessions where `lecturerId` matches the actor's lecturer record.
 * - `HOD` — only sessions for courses in their department.
 * - `SUPER_ADMIN`, `ACADEMIC_AFFAIRS`, `DEAN` — all sessions, optional filters.
 *
 * @param query        - Validated query params from {@link ListSessionsQuerySchema}.
 * @param actorRole    - Role of the requesting user (used for scope enforcement).
 * @param actorScopeId - Scope UUID of the requesting user, or `null` for SUPER_ADMIN.
 * @param actorId      - UUID of the requesting user (used for LECTURER scope).
 * @returns Paginated list of {@link ICourseSessionPublic} records with `meta` object.
 */
export async function listSessions(
  query: ListSessionsQuery,
  actorRole: Role,
  actorScopeId: string | null,
  actorId: string,
): Promise<PaginatedResponse<ICourseSessionPublic>> {
  const { page, pageSize, courseSectionId, status, startDate, endDate } = query;
  const skip = (page - 1) * pageSize;

  const where: Prisma.CourseSessionWhereInput = {};

  if (actorRole === Role.LECTURER) {
    where.lecturer = { userId: actorId };
  } else if (actorRole === Role.HOD && actorScopeId !== null) {
    where.courseSection = { course: { departmentId: actorScopeId } };
  }

  if (courseSectionId !== undefined) where.courseSectionId = courseSectionId;
  if (status !== undefined) where.status = status;
  if (startDate !== undefined) where.scheduledStart = { gte: new Date(startDate) };
  if (endDate !== undefined) {
    where.scheduledStart = {
      ...(where.scheduledStart as object | undefined),
      lte: new Date(endDate),
    };
  }

  const [sessions, total] = await Promise.all([
    prisma.courseSession.findMany({
      where,
      select: SESSION_SELECT,
      skip,
      take: pageSize,
      orderBy: { scheduledStart: 'desc' },
    }),
    prisma.courseSession.count({ where }),
  ]);

  return {
    data: sessions as unknown as ICourseSessionPublic[],
    meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  };
}

// =============================================================================
// getSessionById
// =============================================================================

/**
 * Fetches a single session by UUID with full details and attendance counts by status.
 *
 * @param id - UUID of the session to fetch.
 * @returns The session as {@link ICourseSessionPublic} with nested attendance counts.
 * @throws {AppError} `NOT_FOUND` (404) — session does not exist.
 */
export async function getSessionById(id: string): Promise<ICourseSessionPublic> {
  const session = await prisma.courseSession.findUnique({
    where: { id },
    select: {
      ...SESSION_SELECT,
      _count: {
        select: { attendanceRecords: true },
      },
      attendanceRecords: {
        select: { status: true },
      },
    },
  });
  if (!session) {
    throw new AppError('NOT_FOUND', 'Session not found.', 404);
  }
  return session as unknown as ICourseSessionPublic;
}

// =============================================================================
// autoCreateFromTimetable
// =============================================================================

/**
 * Creates a session from a timetable entry for a specific date.
 *
 * Populates `courseSectionId`, `venueId`, `scheduledStart`, and `scheduledEnd`
 * from the timetable entry. The `startTime` and `endTime` strings (`HH:MM`) are
 * combined with the provided `date` to produce full datetime values.
 *
 * @param timetableEntryId - UUID of the timetable entry to create a session from.
 * @param date             - The date (ISO 8601 date string, e.g. `"2025-09-15"`) for the session.
 * @param actorId          - UUID of the actor creating the session (for audit trail).
 * @returns The created session as {@link ICourseSessionPublic}.
 * @throws {AppError} `NOT_FOUND` (404) — timetable entry does not exist.
 */
export async function autoCreateFromTimetable(
  timetableEntryId: string,
  date: string,
  actorId: string,
): Promise<ICourseSessionPublic> {
  const entry = await prisma.timetableEntry.findUnique({
    where: { id: timetableEntryId },
    select: {
      courseSectionId: true,
      venueId: true,
      startTime: true,
      endTime: true,
      courseSection: { select: { lecturerId: true } },
    },
  });
  if (!entry) {
    throw new AppError('NOT_FOUND', 'Timetable entry not found.', 404);
  }

  const scheduledStart = new Date(`${date}T${entry.startTime}:00`);
  const scheduledEnd = new Date(`${date}T${entry.endTime}:00`);

  const session = await prisma.courseSession.create({
    data: {
      courseSectionId: entry.courseSectionId,
      venueId: entry.venueId,
      lecturerId: entry.courseSection.lecturerId ?? actorId,
      scheduledStart,
      scheduledEnd,
      isMakeUp: false,
      status: 'SCHEDULED',
    },
    select: SESSION_SELECT,
  });

  void writeAuditLog(actorId, 'SUPER_ADMIN', 'SESSION_CREATED', 'CourseSession', session.id, {
    source: 'timetable',
    timetableEntryId,
    date,
  });

  return session as unknown as ICourseSessionPublic;
}

// =============================================================================
// getLiveCheckins
// =============================================================================

/**
 * Returns the current live check-in snapshot for a session.
 *
 * Used for initial page load before the WebSocket connection is established.
 * Returns all `PRESENT` and `PENDING_REVIEW` attendance records for the session.
 *
 * @param sessionId - UUID of the session to fetch live check-ins for.
 * @returns Object with `checkins` array and `total` count.
 * @throws {AppError} `NOT_FOUND` (404) — session does not exist.
 */
export async function getLiveCheckins(sessionId: string): Promise<{
  checkins: Array<{
    studentId: string;
    matricNumber: string;
    fullName: string;
    checkedInAt: Date | null;
    checkInMethod: string | null;
    status: string;
  }>;
  total: number;
}> {
  const session = await prisma.courseSession.findUnique({
    where: { id: sessionId },
    select: { id: true },
  });
  if (!session) {
    throw new AppError('NOT_FOUND', 'Session not found.', 404);
  }

  const records = await prisma.attendanceRecord.findMany({
    where: {
      sessionId,
      status: { in: ['PRESENT', 'PENDING_REVIEW', 'LATE'] },
    },
    select: {
      studentId: true,
      checkedInAt: true,
      checkInMethod: true,
      status: true,
      student: {
        select: {
          matricNumber: true,
          user: { select: { fullName: true } },
        },
      },
    },
    orderBy: { checkedInAt: 'asc' },
  });

  const checkins = records.map((r) => ({
    studentId: r.studentId,
    matricNumber: r.student.matricNumber,
    fullName: r.student.user.fullName,
    checkedInAt: r.checkedInAt,
    checkInMethod: r.checkInMethod,
    status: r.status,
  }));

  return { checkins, total: checkins.length };
}
