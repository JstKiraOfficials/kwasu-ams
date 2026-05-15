/**
 * @file faculties.service.ts
 * @module modules/faculties
 *
 * Business logic for the faculties module.
 *
 * Responsibilities:
 * - Creating, listing, fetching, updating, and deleting faculties
 * - Cascade-safety check before deletion (blocks if departments exist)
 * - Writing AuditLog entries for all state-changing operations (fire-and-forget)
 *
 * Phase 27 note: Replace direct `prisma.auditLog.create` calls with
 * `auditLogQueue.add()` once BullMQ is wired up.
 */

import { type AuditAction, Prisma } from '@prisma/client';
import { type IFaculty, type PaginatedResponse } from '@kwasu-ams/types';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../middleware/error-handler.js';
import {
  type CreateFacultyInput,
  type UpdateFacultyInput,
  type ListFacultiesQuery,
} from './faculties.schema.js';

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
 * @param entityType - Human-readable entity name, e.g. `"Faculty"`.
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
// Prisma select — IFaculty fields + department count
// =============================================================================

/**
 * Prisma `select` object that returns all `IFaculty` fields plus a
 * `_count.departments` aggregate for summary display.
 */
const FACULTY_SELECT = {
  id: true,
  universityId: true,
  name: true,
  code: true,
  deanId: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { departments: true } },
} as const;

// =============================================================================
// createFaculty
// =============================================================================

/**
 * Creates a new faculty record.
 *
 * Rejects duplicate `code` values with a `CONFLICT` error.
 * Writes a `SYSTEM_SETTING_CHANGED` AuditLog entry on success.
 *
 * @param data    - Validated creation payload from {@link CreateFacultySchema}.
 * @param actorId - UUID of the admin creating the faculty (for audit trail).
 * @returns The created faculty record as {@link IFaculty}.
 * @throws {AppError} `CONFLICT` (409) — a faculty with the same code already exists.
 */
export async function createFaculty(data: CreateFacultyInput, actorId: string): Promise<IFaculty> {
  const existing = await prisma.faculty.findUnique({
    where: { code: data.code },
    select: { id: true },
  });
  if (existing) {
    throw new AppError('CONFLICT', `Faculty code "${data.code}" already exists.`, 409, 'code');
  }

  const faculty = await prisma.faculty.create({
    data: {
      name: data.name,
      code: data.code,
      universityId: data.universityId,
    },
    select: FACULTY_SELECT,
  });

  void writeAuditLog(actorId, 'SUPER_ADMIN', 'SYSTEM_SETTING_CHANGED', 'Faculty', faculty.id, {
    action: 'CREATE',
    code: data.code,
  });

  return faculty as unknown as IFaculty;
}

// =============================================================================
// listFaculties
// =============================================================================

/**
 * Returns a paginated list of all faculties, each including a department count.
 *
 * @param query - Validated pagination query from {@link ListFacultiesQuerySchema}.
 * @returns Paginated list of {@link IFaculty} records with `meta` object.
 */
export async function listFaculties(
  query: ListFacultiesQuery,
): Promise<PaginatedResponse<IFaculty>> {
  const { page, pageSize } = query;
  const skip = (page - 1) * pageSize;

  const [faculties, total] = await Promise.all([
    prisma.faculty.findMany({
      select: FACULTY_SELECT,
      skip,
      take: pageSize,
      orderBy: { name: 'asc' },
    }),
    prisma.faculty.count(),
  ]);

  return {
    data: faculties as unknown as IFaculty[],
    meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  };
}

// =============================================================================
// getFacultyById
// =============================================================================

/**
 * Fetches a single faculty by UUID, including its department count.
 *
 * @param id - UUID of the faculty to fetch.
 * @returns The faculty record as {@link IFaculty}.
 * @throws {AppError} `NOT_FOUND` (404) — faculty does not exist.
 */
export async function getFacultyById(id: string): Promise<IFaculty> {
  const faculty = await prisma.faculty.findUnique({
    where: { id },
    select: FACULTY_SELECT,
  });

  if (!faculty) {
    throw new AppError('NOT_FOUND', 'Faculty not found.', 404);
  }

  return faculty as unknown as IFaculty;
}

// =============================================================================
// updateFaculty
// =============================================================================

/**
 * Updates a faculty's `name` and/or `code`.
 *
 * Rejects duplicate `code` values (excluding the current faculty).
 * Writes a `SYSTEM_SETTING_CHANGED` AuditLog entry on success.
 *
 * @param id      - UUID of the faculty to update.
 * @param data    - Validated partial update payload from {@link UpdateFacultySchema}.
 * @param actorId - UUID of the admin performing the update (for audit trail).
 * @returns The updated faculty record as {@link IFaculty}.
 * @throws {AppError} `NOT_FOUND` (404) — faculty does not exist.
 * @throws {AppError} `CONFLICT` (409) — the new code is already used by another faculty.
 */
export async function updateFaculty(
  id: string,
  data: UpdateFacultyInput,
  actorId: string,
): Promise<IFaculty> {
  const existing = await prisma.faculty.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
    throw new AppError('NOT_FOUND', 'Faculty not found.', 404);
  }

  if (data.code !== undefined) {
    const codeConflict = await prisma.faculty.findFirst({
      where: { code: data.code, id: { not: id } },
      select: { id: true },
    });
    if (codeConflict) {
      throw new AppError('CONFLICT', `Faculty code "${data.code}" already exists.`, 409, 'code');
    }
  }

  const updated = await prisma.faculty.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.code !== undefined && { code: data.code }),
    },
    select: FACULTY_SELECT,
  });

  void writeAuditLog(actorId, 'SUPER_ADMIN', 'SYSTEM_SETTING_CHANGED', 'Faculty', id, {
    action: 'UPDATE',
  });

  return updated as unknown as IFaculty;
}

// =============================================================================
// deleteFaculty
// =============================================================================

/**
 * Hard-deletes a faculty after verifying it has no child departments.
 *
 * Writes a `SYSTEM_SETTING_CHANGED` AuditLog entry on success.
 *
 * @param id      - UUID of the faculty to delete.
 * @param actorId - UUID of the SUPER_ADMIN performing the deletion (for audit trail).
 * @returns A promise that resolves once the deletion is complete.
 * @throws {AppError} `NOT_FOUND` (404) — faculty does not exist.
 * @throws {AppError} `CONFLICT` (409) — faculty has one or more departments; delete them first.
 */
export async function deleteFaculty(id: string, actorId: string): Promise<void> {
  const faculty = await prisma.faculty.findUnique({
    where: { id },
    select: { id: true, _count: { select: { departments: true } } },
  });

  if (!faculty) {
    throw new AppError('NOT_FOUND', 'Faculty not found.', 404);
  }

  if (faculty._count.departments > 0) {
    throw new AppError(
      'CONFLICT',
      'Cannot delete faculty with existing departments. Delete all departments first.',
      409,
    );
  }

  await prisma.faculty.delete({ where: { id } });

  void writeAuditLog(actorId, 'SUPER_ADMIN', 'SYSTEM_SETTING_CHANGED', 'Faculty', id, {
    action: 'DELETE',
  });
}
