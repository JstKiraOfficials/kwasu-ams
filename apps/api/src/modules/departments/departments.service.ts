/**
 * @file departments.service.ts
 * @module modules/departments
 *
 * Business logic for the departments module.
 *
 * Responsibilities:
 * - Creating, listing, fetching, updating, and deleting departments
 * - Scope-aware listing: DEAN sees only their faculty's departments;
 *   HOD/LECTURER see only their own department; SUPER_ADMIN/ACADEMIC_AFFAIRS
 *   see all (optionally filtered by facultyId)
 * - Scope enforcement on single-record fetch (database-level, not URL comparison)
 * - Cascade-safety check before deletion (blocks if programmes or courses exist)
 * - Writing AuditLog entries for all state-changing operations (fire-and-forget)
 *
 * Phase 27 note: Replace direct `prisma.auditLog.create` calls with
 * `auditLogQueue.add()` once BullMQ is wired up.
 */

import { type AuditAction, Prisma } from '@prisma/client';
import { type IDepartment, type PaginatedResponse, Role } from '@kwasu-ams/types';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../middleware/error-handler.js';
import {
  type CreateDepartmentInput,
  type UpdateDepartmentInput,
  type ListDepartmentsQuery,
} from './departments.schema.js';

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
 * @param entityType - Human-readable entity name, e.g. `"Department"`.
 * @param entityId   - Optional UUID of the affected entity.
 * @param metadata   - Optional free-form context object.
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
// Prisma select — IDepartment fields + counts
// =============================================================================

/**
 * Prisma `select` object that returns all `IDepartment` fields plus
 * `_count.courses` and `_count.lecturers` aggregates for summary display.
 */
const DEPARTMENT_SELECT = {
  id: true,
  facultyId: true,
  name: true,
  code: true,
  hodId: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { courses: true, lecturers: true } },
} as const;

// =============================================================================
// createDepartment
// =============================================================================

/**
 * Creates a new department record.
 *
 * Rejects duplicate `code` values with a `CONFLICT` error.
 * Writes a `SYSTEM_SETTING_CHANGED` AuditLog entry on success.
 *
 * @param data    - Validated creation payload from {@link CreateDepartmentSchema}.
 * @param actorId - UUID of the admin creating the department (for audit trail).
 * @returns The created department record as {@link IDepartment}.
 * @throws {AppError} `CONFLICT` (409) — a department with the same code already exists.
 */
export async function createDepartment(
  data: CreateDepartmentInput,
  actorId: string,
): Promise<IDepartment> {
  const existing = await prisma.department.findUnique({
    where: { code: data.code },
    select: { id: true },
  });
  if (existing) {
    throw new AppError('CONFLICT', `Department code "${data.code}" already exists.`, 409, 'code');
  }

  const department = await prisma.department.create({
    data: { name: data.name, code: data.code, facultyId: data.facultyId },
    select: DEPARTMENT_SELECT,
  });

  void writeAuditLog(
    actorId,
    'SUPER_ADMIN',
    'SYSTEM_SETTING_CHANGED',
    'Department',
    department.id,
    { action: 'CREATE', code: data.code },
  );

  return department as unknown as IDepartment;
}

// =============================================================================
// listDepartments
// =============================================================================

/**
 * Returns a paginated, scope-aware list of departments.
 *
 * Scope rules (enforced at the Prisma query level):
 * - `SUPER_ADMIN`, `ACADEMIC_AFFAIRS`, `VICE_CHANCELLOR` — all departments,
 *   optionally filtered by `query.facultyId`.
 * - `DEAN` — only departments in their faculty (`actorScopeId = facultyId`).
 * - `HOD`, `LECTURER` — only their own department (`actorScopeId = departmentId`).
 *
 * @param query        - Validated query params from {@link ListDepartmentsQuerySchema}.
 * @param actorRole    - Role of the requesting user (used for scope enforcement).
 * @param actorScopeId - Scope UUID of the requesting user, or `null` for SUPER_ADMIN.
 * @returns Paginated list of {@link IDepartment} records with `meta` object.
 */
export async function listDepartments(
  query: ListDepartmentsQuery,
  actorRole: Role,
  actorScopeId: string | null,
): Promise<PaginatedResponse<IDepartment>> {
  const { page, pageSize, facultyId } = query;
  const skip = (page - 1) * pageSize;

  const where: Prisma.DepartmentWhereInput = {};

  if (actorRole === Role.DEAN && actorScopeId !== null) {
    where.facultyId = actorScopeId;
  } else if ((actorRole === Role.HOD || actorRole === Role.LECTURER) && actorScopeId !== null) {
    where.id = actorScopeId;
  } else if (facultyId !== undefined) {
    // SUPER_ADMIN / ACADEMIC_AFFAIRS / VICE_CHANCELLOR — optional filter
    where.facultyId = facultyId;
  }

  const [departments, total] = await Promise.all([
    prisma.department.findMany({
      where,
      select: DEPARTMENT_SELECT,
      skip,
      take: pageSize,
      orderBy: { name: 'asc' },
    }),
    prisma.department.count({ where }),
  ]);

  return {
    data: departments as unknown as IDepartment[],
    meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  };
}

// =============================================================================
// getDepartmentById
// =============================================================================

/**
 * Fetches a single department by UUID with scope enforcement.
 *
 * Scope rules (enforced via database query, not URL comparison):
 * - `DEAN` — the department must belong to their faculty.
 * - `HOD` / `LECTURER` — the department must be their own (`id === actorScopeId`).
 * - `SUPER_ADMIN`, `ACADEMIC_AFFAIRS`, `VICE_CHANCELLOR` — no restriction.
 *
 * @param id           - UUID of the department to fetch.
 * @param actorRole    - Role of the requesting user.
 * @param actorScopeId - Scope UUID of the requesting user, or `null`.
 * @returns The department record as {@link IDepartment}.
 * @throws {AppError} `NOT_FOUND` (404) — department does not exist.
 * @throws {AppError} `FORBIDDEN` (403) — actor's scope does not include this department.
 */
export async function getDepartmentById(
  id: string,
  actorRole: Role,
  actorScopeId: string | null,
): Promise<IDepartment> {
  const department = await prisma.department.findUnique({
    where: { id },
    select: DEPARTMENT_SELECT,
  });

  if (!department) {
    throw new AppError('NOT_FOUND', 'Department not found.', 404);
  }

  // Scope enforcement at the database-query level
  if (actorRole === Role.DEAN) {
    if (actorScopeId === null || department.facultyId !== actorScopeId) {
      throw new AppError('FORBIDDEN', 'Insufficient permissions.', 403);
    }
  } else if (actorRole === Role.HOD || actorRole === Role.LECTURER) {
    if (actorScopeId === null || department.id !== actorScopeId) {
      throw new AppError('FORBIDDEN', 'Insufficient permissions.', 403);
    }
  }

  return department as unknown as IDepartment;
}

// =============================================================================
// updateDepartment
// =============================================================================

/**
 * Updates a department's `name` and/or `code`.
 *
 * Rejects duplicate `code` values (excluding the current department).
 * Writes a `SYSTEM_SETTING_CHANGED` AuditLog entry on success.
 *
 * @param id      - UUID of the department to update.
 * @param data    - Validated partial update payload from {@link UpdateDepartmentSchema}.
 * @param actorId - UUID of the admin performing the update (for audit trail).
 * @returns The updated department record as {@link IDepartment}.
 * @throws {AppError} `NOT_FOUND` (404) — department does not exist.
 * @throws {AppError} `CONFLICT` (409) — new code already used by another department.
 */
export async function updateDepartment(
  id: string,
  data: UpdateDepartmentInput,
  actorId: string,
): Promise<IDepartment> {
  const existing = await prisma.department.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
    throw new AppError('NOT_FOUND', 'Department not found.', 404);
  }

  if (data.code !== undefined) {
    const codeConflict = await prisma.department.findFirst({
      where: { code: data.code, id: { not: id } },
      select: { id: true },
    });
    if (codeConflict) {
      throw new AppError('CONFLICT', `Department code "${data.code}" already exists.`, 409, 'code');
    }
  }

  const updated = await prisma.department.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.code !== undefined && { code: data.code }),
    },
    select: DEPARTMENT_SELECT,
  });

  void writeAuditLog(actorId, 'SUPER_ADMIN', 'SYSTEM_SETTING_CHANGED', 'Department', id, {
    action: 'UPDATE',
  });

  return updated as unknown as IDepartment;
}

// =============================================================================
// deleteDepartment
// =============================================================================

/**
 * Hard-deletes a department after verifying it has no child programmes or courses.
 *
 * Writes a `SYSTEM_SETTING_CHANGED` AuditLog entry on success.
 *
 * @param id      - UUID of the department to delete.
 * @param actorId - UUID of the SUPER_ADMIN performing the deletion (for audit trail).
 * @returns A promise that resolves once the deletion is complete.
 * @throws {AppError} `NOT_FOUND` (404) — department does not exist.
 * @throws {AppError} `CONFLICT` (409) — department has programmes or courses; delete them first.
 */
export async function deleteDepartment(id: string, actorId: string): Promise<void> {
  const department = await prisma.department.findUnique({
    where: { id },
    select: {
      id: true,
      _count: { select: { programmes: true, courses: true } },
    },
  });

  if (!department) {
    throw new AppError('NOT_FOUND', 'Department not found.', 404);
  }

  if (department._count.programmes > 0 || department._count.courses > 0) {
    throw new AppError(
      'CONFLICT',
      'Cannot delete department with existing programmes or courses. Delete them first.',
      409,
    );
  }

  await prisma.department.delete({ where: { id } });

  void writeAuditLog(actorId, 'SUPER_ADMIN', 'SYSTEM_SETTING_CHANGED', 'Department', id, {
    action: 'DELETE',
  });
}
