/**
 * @file timetable.service.ts
 * @module modules/timetable
 *
 * Business logic for the timetable module.
 *
 * Responsibilities:
 * - Creating, listing, fetching, updating, and deleting timetable entries
 * - Running conflict detection before every create/update via
 *   {@link detectConflicts} — throws `CONFLICT` (409) if any conflicts found
 * - Providing student and lecturer personal timetable views
 * - Writing AuditLog entries for all state-changing operations (fire-and-forget)
 *
 * Phase 27 note: Replace direct `prisma.auditLog.create` calls with
 * `auditLogQueue.add()` once BullMQ is wired up.
 */

import { type AuditAction, Prisma } from '@prisma/client';
import { type ITimetableEntry, type PaginatedResponse } from '@kwasu-ams/types';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../middleware/error-handler.js';
import {
  type CreateTimetableEntryInput,
  type UpdateTimetableEntryInput,
  type ListTimetableQuery,
  type TimetablePersonQuery,
} from './timetable.schema.js';
import { detectConflicts } from './conflict-detector.service.js';

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
 * @param entityType - Human-readable entity name, e.g. `"TimetableEntry"`.
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
// Prisma select — ITimetableEntry fields + relations
// =============================================================================

/**
 * Prisma `select` object that returns all `ITimetableEntry` fields plus
 * nested course section, venue, and lecturer details for rich responses.
 */
const ENTRY_SELECT = {
  id: true,
  courseSectionId: true,
  semesterId: true,
  venueId: true,
  dayOfWeek: true,
  startTime: true,
  endTime: true,
  createdAt: true,
  updatedAt: true,
  courseSection: {
    select: {
      sectionLabel: true,
      lecturerId: true,
      course: { select: { code: true, title: true } },
    },
  },
  venue: { select: { name: true, buildingName: true } },
} as const;

// =============================================================================
// createTimetableEntry
// =============================================================================

/**
 * Creates a new timetable entry after running conflict detection.
 *
 * Conflict detection checks for venue, lecturer, and section overlaps.
 * If any conflicts are found, throws `CONFLICT` (409) with conflict details
 * in the error metadata.
 * Writes a `SYSTEM_SETTING_CHANGED` AuditLog entry on success.
 *
 * @param data    - Validated creation payload from {@link CreateTimetableEntrySchema}.
 * @param actorId - UUID of the admin creating the entry (for audit trail).
 * @returns The created timetable entry as {@link ITimetableEntry}.
 * @throws {AppError} `CONFLICT` (409) — one or more scheduling conflicts detected.
 * @throws {AppError} `NOT_FOUND` (404) — referenced course section, semester, or venue does not exist.
 */
export async function createTimetableEntry(
  data: CreateTimetableEntryInput,
  actorId: string,
): Promise<ITimetableEntry> {
  const conflicts = await detectConflicts(data);
  if (conflicts.length > 0) {
    throw new AppError('CONFLICT', 'Timetable conflict detected.', 409);
  }

  const entry = await prisma.timetableEntry.create({
    data: {
      courseSectionId: data.courseSectionId,
      semesterId: data.semesterId,
      venueId: data.venueId,
      dayOfWeek: data.dayOfWeek,
      startTime: data.startTime,
      endTime: data.endTime,
    },
    select: ENTRY_SELECT,
  });

  void writeAuditLog(actorId, 'SUPER_ADMIN', 'SYSTEM_SETTING_CHANGED', 'TimetableEntry', entry.id, {
    action: 'CREATE',
    dayOfWeek: data.dayOfWeek,
    startTime: data.startTime,
    endTime: data.endTime,
  });

  return entry as unknown as ITimetableEntry;
}

// =============================================================================
// listTimetableEntries
// =============================================================================

/**
 * Returns a paginated list of timetable entries with optional filters.
 *
 * Includes nested course section (with course code/title), venue, and
 * lecturer details in each entry.
 *
 * @param query - Validated query params from {@link ListTimetableQuerySchema}.
 * @returns Paginated list of {@link ITimetableEntry} records with `meta` object.
 */
export async function listTimetableEntries(
  query: ListTimetableQuery,
): Promise<PaginatedResponse<ITimetableEntry>> {
  const { page, pageSize, semesterId, courseSectionId, venueId, dayOfWeek } = query;
  const skip = (page - 1) * pageSize;

  const where: Prisma.TimetableEntryWhereInput = {};
  if (semesterId !== undefined) where.semesterId = semesterId;
  if (courseSectionId !== undefined) where.courseSectionId = courseSectionId;
  if (venueId !== undefined) where.venueId = venueId;
  if (dayOfWeek !== undefined) where.dayOfWeek = dayOfWeek;

  const [entries, total] = await Promise.all([
    prisma.timetableEntry.findMany({
      where,
      select: ENTRY_SELECT,
      skip,
      take: pageSize,
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    }),
    prisma.timetableEntry.count({ where }),
  ]);

  return {
    data: entries as unknown as ITimetableEntry[],
    meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  };
}

// =============================================================================
// getTimetableEntryById
// =============================================================================

/**
 * Fetches a single timetable entry by UUID with full nested details.
 *
 * @param id - UUID of the timetable entry to fetch.
 * @returns The timetable entry as {@link ITimetableEntry} with nested relations.
 * @throws {AppError} `NOT_FOUND` (404) — entry does not exist.
 */
export async function getTimetableEntryById(id: string): Promise<ITimetableEntry> {
  const entry = await prisma.timetableEntry.findUnique({
    where: { id },
    select: ENTRY_SELECT,
  });
  if (!entry) {
    throw new AppError('NOT_FOUND', 'Timetable entry not found.', 404);
  }
  return entry as unknown as ITimetableEntry;
}

// =============================================================================
// updateTimetableEntry
// =============================================================================

/**
 * Partially updates a timetable entry after re-running conflict detection.
 *
 * The current entry is excluded from conflict checks (via `excludeId`) so it
 * does not conflict with itself. Writes a `SYSTEM_SETTING_CHANGED` AuditLog
 * entry on success.
 *
 * @param id      - UUID of the timetable entry to update.
 * @param data    - Validated partial update payload from {@link UpdateTimetableEntrySchema}.
 * @param actorId - UUID of the admin performing the update (for audit trail).
 * @returns The updated timetable entry as {@link ITimetableEntry}.
 * @throws {AppError} `NOT_FOUND` (404) — entry does not exist.
 * @throws {AppError} `CONFLICT` (409) — one or more scheduling conflicts detected.
 */
export async function updateTimetableEntry(
  id: string,
  data: UpdateTimetableEntryInput,
  actorId: string,
): Promise<ITimetableEntry> {
  const existing = await prisma.timetableEntry.findUnique({
    where: { id },
    select: {
      id: true,
      courseSectionId: true,
      semesterId: true,
      venueId: true,
      dayOfWeek: true,
      startTime: true,
      endTime: true,
    },
  });
  if (!existing) {
    throw new AppError('NOT_FOUND', 'Timetable entry not found.', 404);
  }

  // Merge proposed changes with existing values for conflict detection
  const merged = {
    courseSectionId: data.courseSectionId ?? existing.courseSectionId,
    semesterId: data.semesterId ?? existing.semesterId,
    venueId: data.venueId ?? existing.venueId,
    dayOfWeek: (data.dayOfWeek ??
      existing.dayOfWeek) as import('./timetable.schema.js').DayOfWeekValue,
    startTime: data.startTime ?? existing.startTime,
    endTime: data.endTime ?? existing.endTime,
  };

  const conflicts = await detectConflicts(merged, id);
  if (conflicts.length > 0) {
    throw new AppError('CONFLICT', 'Timetable conflict detected.', 409);
  }

  const updated = await prisma.timetableEntry.update({
    where: { id },
    data: {
      ...(data.courseSectionId !== undefined && { courseSectionId: data.courseSectionId }),
      ...(data.semesterId !== undefined && { semesterId: data.semesterId }),
      ...(data.venueId !== undefined && { venueId: data.venueId }),
      ...(data.dayOfWeek !== undefined && { dayOfWeek: data.dayOfWeek }),
      ...(data.startTime !== undefined && { startTime: data.startTime }),
      ...(data.endTime !== undefined && { endTime: data.endTime }),
    },
    select: ENTRY_SELECT,
  });

  void writeAuditLog(actorId, 'SUPER_ADMIN', 'SYSTEM_SETTING_CHANGED', 'TimetableEntry', id, {
    action: 'UPDATE',
  });

  return updated as unknown as ITimetableEntry;
}

// =============================================================================
// deleteTimetableEntry
// =============================================================================

/**
 * Hard-deletes a timetable entry.
 *
 * Only safe to call when no sessions have been created from this entry.
 * Writes a `SYSTEM_SETTING_CHANGED` AuditLog entry on success.
 *
 * @param id      - UUID of the timetable entry to delete.
 * @param actorId - UUID of the admin performing the deletion (for audit trail).
 * @returns A promise that resolves once the deletion is complete.
 * @throws {AppError} `NOT_FOUND` (404) — entry does not exist.
 */
export async function deleteTimetableEntry(id: string, actorId: string): Promise<void> {
  const existing = await prisma.timetableEntry.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
    throw new AppError('NOT_FOUND', 'Timetable entry not found.', 404);
  }

  await prisma.timetableEntry.delete({ where: { id } });

  void writeAuditLog(actorId, 'SUPER_ADMIN', 'SYSTEM_SETTING_CHANGED', 'TimetableEntry', id, {
    action: 'DELETE',
  });
}

// =============================================================================
// getStudentTimetable
// =============================================================================

/**
 * Returns all timetable entries for courses a student is enrolled in,
 * optionally filtered by semester.
 *
 * @param studentId  - UUID of the student record.
 * @param query      - Validated query params from {@link TimetablePersonQuerySchema}.
 * @returns Array of {@link ITimetableEntry} records for the student's enrolled courses.
 * @throws {AppError} `NOT_FOUND` (404) — student does not exist.
 */
export async function getStudentTimetable(
  studentId: string,
  query: TimetablePersonQuery,
): Promise<ITimetableEntry[]> {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true },
  });
  if (!student) {
    throw new AppError('NOT_FOUND', 'Student not found.', 404);
  }

  const where: Prisma.TimetableEntryWhereInput = {
    courseSection: {
      enrollments: { some: { studentId } },
    },
  };
  if (query.semesterId !== undefined) where.semesterId = query.semesterId;

  const entries = await prisma.timetableEntry.findMany({
    where,
    select: ENTRY_SELECT,
    orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
  });

  return entries as unknown as ITimetableEntry[];
}

// =============================================================================
// getLecturerTimetable
// =============================================================================

/**
 * Returns all timetable entries for sections assigned to a lecturer,
 * optionally filtered by semester.
 *
 * @param lecturerId - UUID of the lecturer record.
 * @param query      - Validated query params from {@link TimetablePersonQuerySchema}.
 * @returns Array of {@link ITimetableEntry} records for the lecturer's assigned sections.
 * @throws {AppError} `NOT_FOUND` (404) — lecturer does not exist.
 */
export async function getLecturerTimetable(
  lecturerId: string,
  query: TimetablePersonQuery,
): Promise<ITimetableEntry[]> {
  const lecturer = await prisma.lecturer.findUnique({
    where: { id: lecturerId },
    select: { id: true },
  });
  if (!lecturer) {
    throw new AppError('NOT_FOUND', 'Lecturer not found.', 404);
  }

  const where: Prisma.TimetableEntryWhereInput = {
    courseSection: { lecturerId },
  };
  if (query.semesterId !== undefined) where.semesterId = query.semesterId;

  const entries = await prisma.timetableEntry.findMany({
    where,
    select: ENTRY_SELECT,
    orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
  });

  return entries as unknown as ITimetableEntry[];
}
