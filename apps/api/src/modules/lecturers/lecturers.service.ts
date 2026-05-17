/**
 * @file lecturers.service.ts
 * @module modules/lecturers
 *
 * Business logic for the lecturers module.
 *
 * Responsibilities:
 * - Creating lecturer records with staff ID validation
 * - Scope-aware listing: HOD sees only their department; DEAN sees their faculty
 * - `accountabilityScore` access control: never returned to LECTURER role
 * - Fetching a single lecturer with user and department details
 * - Updating lecturer fields
 * - Writing AuditLog entries for all state-changing operations (fire-and-forget)
 *
 * Identity validation uses `validateStaffId` from `@kwasu-ams/utils` — the
 * single source of truth. Never redefined here.
 *
 * Phase 27 note: Replace direct `prisma.auditLog.create` calls with
 * `auditLogQueue.add()` once BullMQ is wired up.
 */

import { type AuditAction, Prisma } from '@prisma/client';
import {
  type ILecturerPublic,
  type ILecturerWithScore,
  type PaginatedResponse,
  Role,
} from '@kwasu-ams/types';
import { validateStaffId } from '@kwasu-ams/utils';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../middleware/error-handler.js';
import {
  type CreateLecturerInput,
  type UpdateLecturerInput,
  type ListLecturersQuery,
} from './lecturers.schema.js';

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
 * @param entityType - Human-readable entity name, e.g. `"Lecturer"`.
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
// Prisma selects
// =============================================================================

/**
 * Prisma `select` for public lecturer fields — excludes `accountabilityScore`.
 * Used when the requesting role is `LECTURER`.
 */
const LECTURER_PUBLIC_SELECT = {
  id: true,
  userId: true,
  staffId: true,
  departmentId: true,
  title: true,
  createdAt: true,
  updatedAt: true,
  user: {
    select: {
      fullName: true,
      email: true,
      phone: true,
      identifier: true,
      isActive: true,
    },
  },
} as const;

/**
 * Prisma `select` for full lecturer fields — includes `accountabilityScore`.
 * Used for HOD, DEAN, ACADEMIC_AFFAIRS, and SUPER_ADMIN roles.
 */
const LECTURER_FULL_SELECT = {
  ...LECTURER_PUBLIC_SELECT,
  accountabilityScore: true,
} as const;

// =============================================================================
// createLecturer
// =============================================================================

/**
 * Creates a new lecturer record after validating the staff ID.
 *
 * Validation steps:
 * 1. Validates `staffId` against `STAFF_ID_REGEX` (from `@kwasu-ams/utils`).
 * 2. Verifies the linked `userId` exists and has role `LECTURER`.
 * 3. Checks for duplicate `staffId`.
 * 4. Creates the `Lecturer` record.
 * 5. Writes AuditLog.
 *
 * @param data    - Validated creation payload from {@link CreateLecturerSchema}.
 * @param actorId - UUID of the admin creating the lecturer (for audit trail).
 * @returns The created lecturer record as {@link ILecturerPublic}.
 * @throws {AppError} `VALIDATION_ERROR` (400) — staff ID format is invalid.
 * @throws {AppError} `NOT_FOUND` (404) — userId does not exist or is not a LECTURER.
 * @throws {AppError} `CONFLICT` (409) — staff ID already registered.
 */
export async function createLecturer(
  data: CreateLecturerInput,
  actorId: string,
): Promise<ILecturerPublic> {
  // 1. Validate staff ID format
  if (!validateStaffId(data.staffId)) {
    throw new AppError('VALIDATION_ERROR', 'Invalid staff ID format.', 400, 'staffId');
  }

  // 2. Verify userId exists and has role LECTURER
  const user = await prisma.user.findUnique({
    where: { id: data.userId, deletedAt: null },
    select: { id: true, role: true },
  });
  if (!user) {
    throw new AppError('NOT_FOUND', 'User not found.', 404, 'userId');
  }
  if (user.role !== 'LECTURER') {
    throw new AppError(
      'VALIDATION_ERROR',
      'User must have role LECTURER to be linked as a lecturer.',
      400,
      'userId',
    );
  }

  // 3. Check duplicate staff ID
  const existing = await prisma.lecturer.findUnique({
    where: { staffId: data.staffId },
    select: { id: true },
  });
  if (existing) {
    throw new AppError(
      'CONFLICT',
      `Staff ID "${data.staffId}" is already registered.`,
      409,
      'staffId',
    );
  }

  // 4. Create lecturer record
  const lecturer = await prisma.lecturer.create({
    data: {
      userId: data.userId,
      staffId: data.staffId,
      departmentId: data.departmentId,
      title: data.title ?? null,
    },
    select: LECTURER_PUBLIC_SELECT,
  });

  // 5. Write audit log
  void writeAuditLog(actorId, 'SUPER_ADMIN', 'USER_CREATED', 'Lecturer', lecturer.id, {
    staffId: data.staffId,
    departmentId: data.departmentId,
  });

  return lecturer as unknown as ILecturerPublic;
}

// =============================================================================
// listLecturers
// =============================================================================

/**
 * Returns a paginated, scope-aware list of lecturers.
 *
 * Scope rules (enforced at the Prisma query level):
 * - `HOD` — only lecturers in their department (`departmentId = actorScopeId`).
 * - `DEAN` — only lecturers in their faculty (`department.facultyId = actorScopeId`).
 * - `SUPER_ADMIN`, `ACADEMIC_AFFAIRS` — all lecturers, optional `departmentId` filter.
 *
 * `accountabilityScore` is included only for HOD, DEAN, ACADEMIC_AFFAIRS, and
 * SUPER_ADMIN roles. It is never included for LECTURER role.
 *
 * @param query        - Validated query params from {@link ListLecturersQuerySchema}.
 * @param actorRole    - Role of the requesting user (used for scope and score access).
 * @param actorScopeId - Scope UUID of the requesting user, or `null` for SUPER_ADMIN.
 * @returns Paginated list of lecturer records with `meta` object.
 */
export async function listLecturers(
  query: ListLecturersQuery,
  actorRole: Role,
  actorScopeId: string | null,
): Promise<PaginatedResponse<ILecturerPublic | ILecturerWithScore>> {
  const { page, pageSize, departmentId, search } = query;
  const skip = (page - 1) * pageSize;

  const where: Prisma.LecturerWhereInput = {};

  if (actorRole === Role.HOD && actorScopeId !== null) {
    where.departmentId = actorScopeId;
  } else if (actorRole === Role.DEAN && actorScopeId !== null) {
    where.department = { facultyId: actorScopeId };
  } else if (departmentId !== undefined) {
    where.departmentId = departmentId;
  }

  if (search !== undefined && search.length > 0) {
    where.OR = [
      { staffId: { contains: search, mode: 'insensitive' } },
      { user: { fullName: { contains: search, mode: 'insensitive' } } },
    ];
  }

  // Include accountabilityScore only for management roles
  const includeScore =
    actorRole === Role.SUPER_ADMIN ||
    actorRole === Role.ACADEMIC_AFFAIRS ||
    actorRole === Role.HOD ||
    actorRole === Role.DEAN;

  const select = includeScore ? LECTURER_FULL_SELECT : LECTURER_PUBLIC_SELECT;

  const [lecturers, total] = await Promise.all([
    prisma.lecturer.findMany({
      where,
      select,
      skip,
      take: pageSize,
      orderBy: { staffId: 'asc' },
    }),
    prisma.lecturer.count({ where }),
  ]);

  return {
    data: lecturers as unknown as (ILecturerPublic | ILecturerWithScore)[],
    meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  };
}

// =============================================================================
// getLecturerById
// =============================================================================

/**
 * Fetches a single lecturer by UUID with user and department details.
 *
 * `accountabilityScore` is stripped from the response when `requestingRole`
 * is `LECTURER`. This is enforced at the service layer via Prisma `select`,
 * not in post-processing.
 *
 * @param id             - UUID of the lecturer record to fetch.
 * @param requestingRole - Role of the user making the request (controls score visibility).
 * @returns The lecturer record. Includes `accountabilityScore` for HOD+ roles only.
 * @throws {AppError} `NOT_FOUND` (404) — lecturer does not exist.
 */
export async function getLecturerById(
  id: string,
  requestingRole: Role,
): Promise<ILecturerPublic | ILecturerWithScore> {
  const includeScore = requestingRole !== Role.LECTURER;
  const select = includeScore
    ? { ...LECTURER_FULL_SELECT, department: { select: { name: true, code: true } } }
    : { ...LECTURER_PUBLIC_SELECT, department: { select: { name: true, code: true } } };

  const lecturer = await prisma.lecturer.findUnique({ where: { id }, select });
  if (!lecturer) {
    throw new AppError('NOT_FOUND', 'Lecturer not found.', 404);
  }

  return lecturer as unknown as ILecturerPublic | ILecturerWithScore;
}

// =============================================================================
// updateLecturer
// =============================================================================

/**
 * Partially updates a lecturer's department or title.
 *
 * Writes a `USER_UPDATED` AuditLog entry on success.
 *
 * @param id      - UUID of the lecturer record to update.
 * @param data    - Validated partial update payload from {@link UpdateLecturerSchema}.
 * @param actorId - UUID of the admin performing the update (for audit trail).
 * @returns The updated lecturer record as {@link ILecturerPublic}.
 * @throws {AppError} `NOT_FOUND` (404) — lecturer does not exist.
 */
export async function updateLecturer(
  id: string,
  data: UpdateLecturerInput,
  actorId: string,
): Promise<ILecturerPublic> {
  const existing = await prisma.lecturer.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
    throw new AppError('NOT_FOUND', 'Lecturer not found.', 404);
  }

  const updated = await prisma.lecturer.update({
    where: { id },
    data: {
      ...(data.departmentId !== undefined && { departmentId: data.departmentId }),
      ...(data.title !== undefined && { title: data.title }),
    },
    select: LECTURER_PUBLIC_SELECT,
  });

  void writeAuditLog(actorId, 'SUPER_ADMIN', 'USER_UPDATED', 'Lecturer', id, {
    action: 'UPDATE',
  });

  return updated as unknown as ILecturerPublic;
}
