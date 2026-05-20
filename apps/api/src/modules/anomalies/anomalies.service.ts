/**
 * @file anomalies.service.ts
 * @module modules/anomalies
 *
 * Business logic for the anomaly flags module.
 *
 * Responsibilities:
 * - Creating anomaly flags (called internally by check-in services and workers)
 * - Scope-aware listing: LECTURER sees only their sessions; HOD sees their dept;
 *   DEAN sees their faculty; SUPER_ADMIN/ACADEMIC_AFFAIRS see all
 * - Fetching a single anomaly flag with full details
 * - Reviewing anomaly flags with three possible actions:
 *   - `CONFIRMED_PRESENT` — updates AttendanceRecord status to PRESENT
 *   - `CONFIRMED_ABSENT`  — updates AttendanceRecord status to ABSENT
 *   - `ESCALATED`         — creates a HOD_AWARENESS_FLAG for the HOD's queue
 *
 * Anomaly flags are soft signals — they never auto-ban students.
 * All review decisions are made by humans (lecturers, HODs, admins).
 *
 * Phase 27 note: Replace direct `prisma.auditLog.create` calls with
 * `auditLogQueue.add()` once BullMQ is wired up.
 */

import { type AuditAction, Prisma } from '@prisma/client';
import { type IAnomalyFlag, type PaginatedResponse, Role, AnomalyType } from '@kwasu-ams/types';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../middleware/error-handler.js';
import {
  type ListAnomaliesQuery,
  type ReviewAnomalyInput,
  type CreateAnomalyFlagInput,
} from './anomalies.schema.js';

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
 * @param entityType - Human-readable entity name, e.g. `"AnomalyFlag"`.
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
// Prisma select — IAnomalyFlag fields
// =============================================================================

/**
 * Prisma `select` object that returns all `IAnomalyFlag` fields plus
 * nested student name and session details for rich responses.
 */
const ANOMALY_SELECT = {
  id: true,
  studentId: true,
  sessionId: true,
  flagType: true,
  description: true,
  isReviewed: true,
  reviewedById: true,
  reviewedAt: true,
  reviewAction: true,
  reviewNote: true,
  createdAt: true,
  student: {
    select: {
      matricNumber: true,
      user: { select: { fullName: true } },
    },
  },
} as const;

// =============================================================================
// createAnomalyFlag
// =============================================================================

/**
 * Creates a new anomaly flag record.
 *
 * This is an internal method called by check-in services (Phases 19–20) and
 * the anomaly detection worker (Phase 27). It is not exposed as a public API.
 *
 * Uses `upsert` with the unique constraint `[studentId, sessionId, flagType]`
 * to prevent duplicate flags for the same event.
 *
 * @param data    - Anomaly flag creation payload from {@link CreateAnomalyFlagInput}.
 * @param actorId - UUID of the system actor creating the flag (for audit trail).
 * @returns The created (or existing) anomaly flag as {@link IAnomalyFlag}.
 */
export async function createAnomalyFlag(
  data: CreateAnomalyFlagInput,
  actorId: string,
): Promise<IAnomalyFlag> {
  const flag = await prisma.anomalyFlag.upsert({
    where: {
      studentId_sessionId_flagType: {
        studentId: data.studentId,
        sessionId: data.sessionId ?? '',
        flagType: data.flagType,
      },
    },
    create: {
      studentId: data.studentId,
      sessionId: data.sessionId ?? null,
      flagType: data.flagType,
      description: data.description,
    },
    update: {},
    select: ANOMALY_SELECT,
  });

  void writeAuditLog(actorId, 'SUPER_ADMIN', 'ATTENDANCE_RECORDED', 'AnomalyFlag', flag.id, {
    flagType: data.flagType,
    studentId: data.studentId,
  });

  return flag as unknown as IAnomalyFlag;
}

// =============================================================================
// listAnomalyFlags
// =============================================================================

/**
 * Returns a paginated, scope-aware list of anomaly flags.
 *
 * Scope rules (enforced at the Prisma query level):
 * - `LECTURER` — only flags for sessions where they are the assigned lecturer.
 * - `HOD` — only flags for students in their department.
 * - `DEAN` — only flags for students in their faculty.
 * - `SUPER_ADMIN`, `ACADEMIC_AFFAIRS` — all flags, optional filters.
 *
 * @param query        - Validated query params from {@link ListAnomaliesQuerySchema}.
 * @param actorRole    - Role of the requesting user (used for scope enforcement).
 * @param actorScopeId - Scope UUID of the requesting user, or `null` for SUPER_ADMIN.
 * @param actorId      - UUID of the requesting user (used for LECTURER scope).
 * @returns Paginated list of {@link IAnomalyFlag} records with `meta` object.
 */
export async function listAnomalyFlags(
  query: ListAnomaliesQuery,
  actorRole: Role,
  actorScopeId: string | null,
  actorId: string,
): Promise<PaginatedResponse<IAnomalyFlag>> {
  const { page, pageSize, sessionId, studentId, flagType, isReviewed } = query;
  const skip = (page - 1) * pageSize;

  const where: Prisma.AnomalyFlagWhereInput = {};

  // Scope enforcement
  if (actorRole === Role.LECTURER) {
    where.session = { lecturer: { userId: actorId } };
  } else if (actorRole === Role.HOD && actorScopeId !== null) {
    where.student = { programme: { departmentId: actorScopeId } };
  } else if (actorRole === Role.DEAN && actorScopeId !== null) {
    where.student = { programme: { department: { facultyId: actorScopeId } } };
  }

  // Optional filters
  if (sessionId !== undefined) where.sessionId = sessionId;
  if (studentId !== undefined) where.studentId = studentId;
  if (flagType !== undefined) where.flagType = flagType;
  if (isReviewed !== undefined) where.isReviewed = isReviewed;

  const [flags, total] = await Promise.all([
    prisma.anomalyFlag.findMany({
      where,
      select: ANOMALY_SELECT,
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.anomalyFlag.count({ where }),
  ]);

  return {
    data: flags as unknown as IAnomalyFlag[],
    meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  };
}

// =============================================================================
// getAnomalyFlagById
// =============================================================================

/**
 * Fetches a single anomaly flag by UUID with full nested details.
 *
 * @param id - UUID of the anomaly flag to fetch.
 * @returns The anomaly flag as {@link IAnomalyFlag} with nested student and session details.
 * @throws {AppError} `NOT_FOUND` (404) — anomaly flag does not exist.
 */
export async function getAnomalyFlagById(id: string): Promise<IAnomalyFlag> {
  const flag = await prisma.anomalyFlag.findUnique({ where: { id }, select: ANOMALY_SELECT });
  if (!flag) {
    throw new AppError('NOT_FOUND', 'Anomaly flag not found.', 404);
  }
  return flag as unknown as IAnomalyFlag;
}

// =============================================================================
// reviewAnomalyFlag
// =============================================================================

/**
 * Reviews an anomaly flag with one of three possible actions.
 *
 * Actions:
 * - `CONFIRMED_PRESENT` — Updates the associated `AttendanceRecord.status` to `PRESENT`.
 * - `CONFIRMED_ABSENT`  — Updates the associated `AttendanceRecord.status` to `ABSENT`.
 * - `ESCALATED`         — Creates a new `HOD_AWARENESS_FLAG` anomaly for the HOD's queue.
 *
 * All actions set `isReviewed = true` on the original flag.
 * Writes an `ATTENDANCE_OVERRIDDEN` AuditLog entry when attendance status changes.
 *
 * @param id      - UUID of the anomaly flag to review.
 * @param data    - Validated review payload from {@link ReviewAnomalySchema}.
 * @param actorId - UUID of the reviewer (for audit trail).
 * @returns The updated anomaly flag as {@link IAnomalyFlag}.
 * @throws {AppError} `NOT_FOUND` (404) — anomaly flag does not exist.
 * @throws {AppError} `CONFLICT` (409) — flag has already been reviewed.
 */
export async function reviewAnomalyFlag(
  id: string,
  data: ReviewAnomalyInput,
  actorId: string,
): Promise<IAnomalyFlag> {
  // 1. Fetch flag
  const flag = await prisma.anomalyFlag.findUnique({
    where: { id },
    select: {
      id: true,
      isReviewed: true,
      studentId: true,
      sessionId: true,
      flagType: true,
    },
  });
  if (!flag) {
    throw new AppError('NOT_FOUND', 'Anomaly flag not found.', 404);
  }

  // 2. Reject if already reviewed
  if (flag.isReviewed) {
    throw new AppError('CONFLICT', 'Anomaly flag has already been reviewed.', 409);
  }

  // 3. Update flag
  const updated = await prisma.anomalyFlag.update({
    where: { id },
    data: {
      isReviewed: true,
      reviewedById: actorId,
      reviewedAt: new Date(),
      reviewAction: data.action,
      reviewNote: data.note,
    },
    select: ANOMALY_SELECT,
  });

  // 4. Side effects based on action
  if (
    (data.action === 'CONFIRMED_PRESENT' || data.action === 'CONFIRMED_ABSENT') &&
    flag.sessionId !== null
  ) {
    const newStatus = data.action === 'CONFIRMED_PRESENT' ? 'PRESENT' : 'ABSENT';

    await prisma.attendanceRecord.updateMany({
      where: { studentId: flag.studentId, sessionId: flag.sessionId },
      data: { status: newStatus },
    });

    void writeAuditLog(actorId, 'LECTURER', 'ATTENDANCE_OVERRIDDEN', 'AttendanceRecord', id, {
      action: data.action,
      newStatus,
      studentId: flag.studentId,
      sessionId: flag.sessionId,
    });
  } else if (data.action === 'ESCALATED') {
    // Create HOD_AWARENESS_FLAG for the HOD's review queue
    await prisma.anomalyFlag.create({
      data: {
        studentId: flag.studentId,
        sessionId: flag.sessionId,
        flagType: AnomalyType.HOD_AWARENESS_FLAG,
        description: `Escalated from ${flag.flagType} review by actor ${actorId}. Note: ${data.note}`,
      },
    });

    void writeAuditLog(actorId, 'LECTURER', 'ATTENDANCE_RECORDED', 'AnomalyFlag', id, {
      action: 'ESCALATED',
      originalFlagType: flag.flagType,
    });
  }

  return updated as unknown as IAnomalyFlag;
}
