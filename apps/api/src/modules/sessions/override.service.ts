/**
 * @file override.service.ts
 * @module modules/sessions
 *
 * Business logic for the manual attendance override system.
 *
 * Three responsibilities:
 * 1. **`createOverride`** — Lecturer/HOD/SUPER_ADMIN overrides a student's
 *    attendance status after session close. Within the 48-hour window the
 *    `AttendanceRecord` is updated immediately. Beyond the window a pending
 *    `ManualOverride` is created and the record is NOT updated until a
 *    `SUPER_ADMIN` approves (maker-checker pattern).
 * 2. **`approveOverride`** — SUPER_ADMIN approves a pending override, applying
 *    the status change to the `AttendanceRecord`.
 * 3. **`rejectOverride`** — SUPER_ADMIN rejects a pending override, recording
 *    the reason without touching the `AttendanceRecord`.
 * 4. **`listOverrides`** — Scope-aware list of all overrides for a session.
 *
 * Immutability invariants:
 * - Sessions in `SCHEDULED` or `ACTIVE` state cannot be overridden.
 * - Sessions in `LOCKED` state require `SUPER_ADMIN` approval regardless of
 *   the override window (window is always expired for LOCKED sessions).
 * - GPS coordinates are never stored — this service never touches coordinates.
 * - Every override writes an `AuditLog` entry with `beforeJson`/`afterJson`.
 */

import { type Role, type IManualOverride, AttendanceStatus } from '@kwasu-ams/types';
import { isWithinWindow } from '@kwasu-ams/utils';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../middleware/error-handler.js';

// =============================================================================
// Input types
// =============================================================================

/**
 * Validated input for creating a manual override.
 *
 * - `status`        — Target `AttendanceStatus`. Must be one of the four
 *                     overrideable values: `PRESENT`, `ABSENT`, `EXCUSED`, `LATE`.
 * - `justification` — Free-text reason. Minimum 20 characters.
 */
export interface OverrideInput {
  /** Target attendance status. Cannot be `PENDING_REVIEW` or `MANUAL_OVERRIDE`. */
  status: AttendanceStatus;
  /** Human-readable justification. Minimum 20 characters. */
  justification: string;
}

// =============================================================================
// createOverride
// =============================================================================

/**
 * Creates a manual attendance override for a student in a closed session.
 *
 * Within the 48-hour override window the `AttendanceRecord` is updated
 * immediately and `ManualOverride.requiresAdminApproval` is `false`.
 *
 * Beyond the window (or when `overrideWindowEnd` is null) the override is
 * stored with `requiresAdminApproval: true` and the `AttendanceRecord` is
 * NOT updated until a `SUPER_ADMIN` approves via {@link approveOverride}.
 *
 * @param sessionId  - UUID of the `CourseSession` to override attendance for.
 * @param studentId  - UUID of the `Student` record (not the `User`).
 * @param data       - Override input: target status and justification.
 * @param actorId    - UUID of the authenticated user performing the override.
 * @param actorRole  - Role of the authenticated user (for audit trail).
 * @returns The created {@link IManualOverride} record.
 * @throws {AppError} `NOT_FOUND` (404)          — session or attendance record not found.
 * @throws {AppError} `SESSION_NOT_ACTIVE` (400) — session is still SCHEDULED or ACTIVE.
 * @throws {AppError} `VALIDATION_ERROR` (400)   — justification is shorter than 20 characters.
 */
export async function createOverride(
  sessionId: string,
  studentId: string,
  data: OverrideInput,
  actorId: string,
  actorRole: Role,
): Promise<IManualOverride> {
  // ── Step 1: Fetch session ────────────────────────────────────────────────
  const session = await prisma.courseSession.findUnique({
    where: { id: sessionId },
    select: { id: true, status: true, overrideWindowEnd: true },
  });
  if (!session) {
    throw new AppError('NOT_FOUND', 'Session not found.', 404);
  }

  // ── Step 2: Reject overrides on open sessions ────────────────────────────
  if (session.status === 'SCHEDULED' || session.status === 'ACTIVE') {
    throw new AppError(
      'SESSION_NOT_ACTIVE',
      'Session must be closed before overrides can be applied.',
      400,
    );
  }

  // ── Step 3: Fetch attendance record ─────────────────────────────────────
  const record = await prisma.attendanceRecord.findUnique({
    where: { studentId_sessionId: { studentId, sessionId } },
  });
  if (!record) {
    throw new AppError(
      'NOT_FOUND',
      'Attendance record not found for this student and session.',
      404,
    );
  }

  // ── Step 4: Validate justification length ───────────────────────────────
  if (data.justification.length < 20) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Justification must be at least 20 characters.',
      400,
      'justification',
    );
  }

  // ── Step 5: Determine override window ───────────────────────────────────
  // null overrideWindowEnd means the session was never properly closed — treat as expired
  const withinWindow =
    session.overrideWindowEnd !== null && isWithinWindow(new Date(), session.overrideWindowEnd);

  const beforeStatus = record.status;

  if (withinWindow) {
    // ── Step 6a: Within window — apply immediately ─────────────────────────
    const [override] = await prisma.$transaction([
      prisma.manualOverride.create({
        data: {
          attendanceRecordId: record.id,
          actorId,
          actorRole,
          justification: data.justification,
          beforeStatus,
          afterStatus: data.status,
          requiresAdminApproval: false,
        },
      }),
      prisma.attendanceRecord.update({
        where: { id: record.id },
        data: { status: data.status, checkInMethod: 'MANUAL_OVERRIDE' },
      }),
    ]);

    void prisma.auditLog.create({
      data: {
        actorId,
        actorRole,
        action: 'ATTENDANCE_OVERRIDDEN',
        entityType: 'AttendanceRecord',
        entityId: record.id,
        beforeJson: { status: beforeStatus },
        afterJson: { status: data.status, checkInMethod: 'MANUAL_OVERRIDE' },
      },
    });

    return override as unknown as IManualOverride;
  } else {
    // ── Step 7a: Beyond window — create pending override ───────────────────
    const override = await prisma.manualOverride.create({
      data: {
        attendanceRecordId: record.id,
        actorId,
        actorRole,
        justification: data.justification,
        beforeStatus,
        afterStatus: data.status,
        requiresAdminApproval: true,
      },
    });

    void prisma.auditLog.create({
      data: {
        actorId,
        actorRole,
        action: 'ATTENDANCE_OVERRIDDEN',
        entityType: 'AttendanceRecord',
        entityId: record.id,
        beforeJson: { status: beforeStatus },
        afterJson: { status: data.status, pendingAdminApproval: true },
        metadata: { pendingAdminApproval: true },
      },
    });

    return override as unknown as IManualOverride;
  }
}

// =============================================================================
// approveOverride
// =============================================================================

/**
 * Approves a pending manual override. `SUPER_ADMIN` only.
 *
 * Applies the override's `afterStatus` to the linked `AttendanceRecord` and
 * marks the `ManualOverride` as approved by setting `approvedById` and
 * `approvedAt`.
 *
 * @param overrideId - UUID of the `ManualOverride` to approve.
 * @param actorId    - UUID of the `SUPER_ADMIN` approving the override.
 * @returns The updated {@link IManualOverride} record.
 * @throws {AppError} `NOT_FOUND` (404) — override does not exist.
 * @throws {AppError} `CONFLICT` (409)  — override does not require approval, or is already processed.
 */
export async function approveOverride(
  overrideId: string,
  actorId: string,
): Promise<IManualOverride> {
  // ── Step 1: Fetch override ───────────────────────────────────────────────
  const override = await prisma.manualOverride.findUnique({
    where: { id: overrideId },
    include: { attendanceRecord: true },
  });
  if (!override) {
    throw new AppError('NOT_FOUND', 'Override not found.', 404);
  }

  // ── Step 2: Guard — must require approval ───────────────────────────────
  if (!override.requiresAdminApproval) {
    throw new AppError('CONFLICT', 'Override does not require approval.', 409);
  }

  // ── Step 3: Guard — must not already be processed ───────────────────────
  if (override.approvedById !== null || override.rejectedById !== null) {
    throw new AppError('CONFLICT', 'Override has already been processed.', 409);
  }

  const now = new Date();

  // ── Step 4 & 5: Apply status change and mark approved ───────────────────
  const [updated] = await prisma.$transaction([
    prisma.manualOverride.update({
      where: { id: overrideId },
      data: { approvedById: actorId, approvedAt: now },
    }),
    prisma.attendanceRecord.update({
      where: { id: override.attendanceRecordId },
      data: { status: override.afterStatus, checkInMethod: 'MANUAL_OVERRIDE' },
    }),
  ]);

  // ── Step 6: Write audit log ──────────────────────────────────────────────
  void prisma.auditLog.create({
    data: {
      actorId,
      actorRole: 'SUPER_ADMIN',
      action: 'ATTENDANCE_OVERRIDDEN',
      entityType: 'AttendanceRecord',
      entityId: override.attendanceRecordId,
      beforeJson: { status: override.beforeStatus },
      afterJson: { status: override.afterStatus, checkInMethod: 'MANUAL_OVERRIDE' },
      metadata: { approvedBy: actorId, overrideId },
    },
  });

  return updated as unknown as IManualOverride;
}

// =============================================================================
// rejectOverride
// =============================================================================

/**
 * Rejects a pending manual override. `SUPER_ADMIN` only.
 *
 * Records the rejection reason on the `ManualOverride` without touching the
 * `AttendanceRecord`. The original attendance status is preserved.
 *
 * @param overrideId - UUID of the `ManualOverride` to reject.
 * @param reason     - Human-readable rejection reason. Minimum 5 characters.
 * @param actorId    - UUID of the `SUPER_ADMIN` rejecting the override.
 * @returns The updated {@link IManualOverride} record.
 * @throws {AppError} `NOT_FOUND` (404) — override does not exist.
 * @throws {AppError} `CONFLICT` (409)  — override does not require approval, or is already processed.
 */
export async function rejectOverride(
  overrideId: string,
  reason: string,
  actorId: string,
): Promise<IManualOverride> {
  // ── Step 1: Fetch override ───────────────────────────────────────────────
  const override = await prisma.manualOverride.findUnique({
    where: { id: overrideId },
  });
  if (!override) {
    throw new AppError('NOT_FOUND', 'Override not found.', 404);
  }

  // ── Step 2: Guard — must require approval ───────────────────────────────
  if (!override.requiresAdminApproval) {
    throw new AppError('CONFLICT', 'Override does not require approval.', 409);
  }

  // ── Step 3: Guard — must not already be processed ───────────────────────
  if (override.approvedById !== null || override.rejectedById !== null) {
    throw new AppError('CONFLICT', 'Override has already been processed.', 409);
  }

  const now = new Date();

  // ── Step 4: Record rejection ─────────────────────────────────────────────
  const updated = await prisma.manualOverride.update({
    where: { id: overrideId },
    data: { rejectedById: actorId, rejectedAt: now, rejectionReason: reason },
  });

  // ── Step 5: Write audit log ──────────────────────────────────────────────
  void prisma.auditLog.create({
    data: {
      actorId,
      actorRole: 'SUPER_ADMIN',
      action: 'ATTENDANCE_OVERRIDDEN',
      entityType: 'AttendanceRecord',
      entityId: override.attendanceRecordId,
      beforeJson: { status: override.beforeStatus },
      afterJson: { status: override.beforeStatus, rejected: true },
      metadata: { rejectedBy: actorId, reason, overrideId },
    },
  });

  return updated as unknown as IManualOverride;
}

// =============================================================================
// listOverrides
// =============================================================================

/**
 * Returns all manual overrides for a given session, scope-aware.
 *
 * - `SUPER_ADMIN` — sees all overrides for the session.
 * - `HOD`         — sees overrides for sessions in their department.
 * - `LECTURER`    — sees overrides only for sessions they own.
 *
 * @param sessionId    - UUID of the `CourseSession` to list overrides for.
 * @param actorRole    - Role of the requesting user (for scope filtering).
 * @param actorId      - UUID of the requesting user (for LECTURER scope).
 * @param actorScopeId - Department UUID for HOD scope, or `null`.
 * @returns An array of {@link IManualOverride} records.
 * @throws {AppError} `NOT_FOUND` (404) — session does not exist.
 */
export async function listOverrides(
  sessionId: string,
  actorRole: Role,
  actorId: string,
  actorScopeId: string | null,
): Promise<IManualOverride[]> {
  // Verify session exists and apply scope check
  const session = await prisma.courseSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      lecturerId: true,
      courseSection: {
        select: {
          course: { select: { departmentId: true } },
        },
      },
    },
  });
  if (!session) {
    throw new AppError('NOT_FOUND', 'Session not found.', 404);
  }

  // Scope enforcement at the query level
  if (actorRole === 'LECTURER') {
    // Lecturer can only see overrides for their own sessions
    const lecturer = await prisma.lecturer.findUnique({
      where: { userId: actorId },
      select: { id: true },
    });
    if (!lecturer || session.lecturerId !== lecturer.id) {
      throw new AppError('FORBIDDEN', 'You do not have access to this session.', 403);
    }
  } else if (actorRole === 'HOD' && actorScopeId !== null) {
    // HOD can only see overrides for sessions in their department
    const deptId = session.courseSection.course.departmentId;
    if (deptId !== actorScopeId) {
      throw new AppError('FORBIDDEN', 'You do not have access to this session.', 403);
    }
  }

  const overrides = await prisma.manualOverride.findMany({
    where: {
      attendanceRecord: { sessionId },
    },
    orderBy: { createdAt: 'desc' },
  });

  return overrides as unknown as IManualOverride[];
}
