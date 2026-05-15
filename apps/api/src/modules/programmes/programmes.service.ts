/**
 * @file programmes.service.ts
 * @module modules/programmes
 *
 * Business logic for the programmes module.
 *
 * Responsibilities:
 * - Creating, listing, fetching, updating, and deleting programmes
 * - Scope-aware listing: DEAN sees only their faculty's programmes;
 *   HOD/LECTURER see only their department's programmes;
 *   SUPER_ADMIN/ACADEMIC_AFFAIRS see all (optionally filtered by departmentId)
 * - Cascade-safety check before deletion (blocks if students are enrolled)
 * - Writing AuditLog entries for all state-changing operations (fire-and-forget)
 *
 * Phase 27 note: Replace direct `prisma.auditLog.create` calls with
 * `auditLogQueue.add()` once BullMQ is wired up.
 */

import { type AuditAction, Prisma } from '@prisma/client';
import { type IProgramme, type PaginatedResponse, Role } from '@kwasu-ams/types';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../middleware/error-handler.js';
import {
  type CreateProgrammeInput,
  type UpdateProgrammeInput,
  type ListProgrammesQuery,
} from './programmes.schema.js';

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
 * @param entityType - Human-readable entity name, e.g. `"Programme"`.
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
// Prisma select — IProgramme fields
// =============================================================================

/**
 * Prisma `select` object that returns all `IProgramme` fields.
 */
const PROGRAMME_SELECT = {
  id: true,
  departmentId: true,
  name: true,
  code: true,
  durationYears: true,
  createdAt: true,
  updatedAt: true,
} as const;

// =============================================================================
// createProgramme
// =============================================================================

/**
 * Creates a new programme record.
 *
 * Rejects duplicate `code` values with a `CONFLICT` error.
 * Writes a `SYSTEM_SETTING_CHANGED` AuditLog entry on success.
 *
 * @param data    - Validated creation payload from {@link CreateProgrammeSchema}.
 * @param actorId - UUID of the admin creating the programme (for audit trail).
 * @returns The created programme record as {@link IProgramme}.
 * @throws {AppError} `CONFLICT` (409) — a programme with the same code already exists.
 */
export async function createProgramme(
  data: CreateProgrammeInput,
  actorId: string,
): Promise<IProgramme> {
  const existing = await prisma.programme.findUnique({
    where: { code: data.code },
    select: { id: true },
  });
  if (existing) {
    throw new AppError('CONFLICT', `Programme code "${data.code}" already exists.`, 409, 'code');
  }

  const programme = await prisma.programme.create({
    data: {
      name: data.name,
      code: data.code,
      departmentId: data.departmentId,
      durationYears: data.durationYears,
    },
    select: PROGRAMME_SELECT,
  });

  void writeAuditLog(actorId, 'SUPER_ADMIN', 'SYSTEM_SETTING_CHANGED', 'Programme', programme.id, {
    action: 'CREATE',
    code: data.code,
  });

  return programme as IProgramme;
}

// =============================================================================
// listProgrammes
// =============================================================================

/**
 * Returns a paginated, scope-aware list of programmes.
 *
 * Scope rules (enforced at the Prisma query level):
 * - `SUPER_ADMIN`, `ACADEMIC_AFFAIRS`, `VICE_CHANCELLOR`, `STUDENT` — all
 *   programmes, optionally filtered by `query.departmentId`.
 * - `DEAN` — only programmes in their faculty (`actorScopeId = facultyId`).
 * - `HOD`, `LECTURER` — only programmes in their department (`actorScopeId = departmentId`).
 *
 * @param query        - Validated query params from {@link ListProgrammesQuerySchema}.
 * @param actorRole    - Role of the requesting user (used for scope enforcement).
 * @param actorScopeId - Scope UUID of the requesting user, or `null` for SUPER_ADMIN.
 * @returns Paginated list of {@link IProgramme} records with `meta` object.
 */
export async function listProgrammes(
  query: ListProgrammesQuery,
  actorRole: Role,
  actorScopeId: string | null,
): Promise<PaginatedResponse<IProgramme>> {
  const { page, pageSize, departmentId } = query;
  const skip = (page - 1) * pageSize;

  const where: Prisma.ProgrammeWhereInput = {};

  if (actorRole === Role.DEAN && actorScopeId !== null) {
    where.department = { facultyId: actorScopeId };
  } else if ((actorRole === Role.HOD || actorRole === Role.LECTURER) && actorScopeId !== null) {
    where.departmentId = actorScopeId;
  } else if (departmentId !== undefined) {
    where.departmentId = departmentId;
  }

  const [programmes, total] = await Promise.all([
    prisma.programme.findMany({
      where,
      select: PROGRAMME_SELECT,
      skip,
      take: pageSize,
      orderBy: { name: 'asc' },
    }),
    prisma.programme.count({ where }),
  ]);

  return {
    data: programmes as IProgramme[],
    meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  };
}

// =============================================================================
// getProgrammeById
// =============================================================================

/**
 * Fetches a single programme by UUID.
 *
 * @param id - UUID of the programme to fetch.
 * @returns The programme record as {@link IProgramme}.
 * @throws {AppError} `NOT_FOUND` (404) — programme does not exist.
 */
export async function getProgrammeById(id: string): Promise<IProgramme> {
  const programme = await prisma.programme.findUnique({
    where: { id },
    select: PROGRAMME_SELECT,
  });

  if (!programme) {
    throw new AppError('NOT_FOUND', 'Programme not found.', 404);
  }

  return programme as IProgramme;
}

// =============================================================================
// updateProgramme
// =============================================================================

/**
 * Updates a programme's `name`, `code`, and/or `durationYears`.
 *
 * Rejects duplicate `code` values (excluding the current programme).
 * Writes a `SYSTEM_SETTING_CHANGED` AuditLog entry on success.
 *
 * @param id      - UUID of the programme to update.
 * @param data    - Validated partial update payload from {@link UpdateProgrammeSchema}.
 * @param actorId - UUID of the admin performing the update (for audit trail).
 * @returns The updated programme record as {@link IProgramme}.
 * @throws {AppError} `NOT_FOUND` (404) — programme does not exist.
 * @throws {AppError} `CONFLICT` (409) — new code already used by another programme.
 */
export async function updateProgramme(
  id: string,
  data: UpdateProgrammeInput,
  actorId: string,
): Promise<IProgramme> {
  const existing = await prisma.programme.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
    throw new AppError('NOT_FOUND', 'Programme not found.', 404);
  }

  if (data.code !== undefined) {
    const codeConflict = await prisma.programme.findFirst({
      where: { code: data.code, id: { not: id } },
      select: { id: true },
    });
    if (codeConflict) {
      throw new AppError('CONFLICT', `Programme code "${data.code}" already exists.`, 409, 'code');
    }
  }

  const updated = await prisma.programme.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.code !== undefined && { code: data.code }),
      ...(data.durationYears !== undefined && { durationYears: data.durationYears }),
    },
    select: PROGRAMME_SELECT,
  });

  void writeAuditLog(actorId, 'SUPER_ADMIN', 'SYSTEM_SETTING_CHANGED', 'Programme', id, {
    action: 'UPDATE',
  });

  return updated as IProgramme;
}

// =============================================================================
// deleteProgramme
// =============================================================================

/**
 * Hard-deletes a programme after verifying no students are enrolled in it.
 *
 * Writes a `SYSTEM_SETTING_CHANGED` AuditLog entry on success.
 *
 * @param id      - UUID of the programme to delete.
 * @param actorId - UUID of the SUPER_ADMIN performing the deletion (for audit trail).
 * @returns A promise that resolves once the deletion is complete.
 * @throws {AppError} `NOT_FOUND` (404) — programme does not exist.
 * @throws {AppError} `CONFLICT` (409) — students are enrolled in this programme.
 */
export async function deleteProgramme(id: string, actorId: string): Promise<void> {
  const programme = await prisma.programme.findUnique({
    where: { id },
    select: { id: true, _count: { select: { students: true } } },
  });

  if (!programme) {
    throw new AppError('NOT_FOUND', 'Programme not found.', 404);
  }

  if (programme._count.students > 0) {
    throw new AppError('CONFLICT', 'Cannot delete programme with enrolled students.', 409);
  }

  await prisma.programme.delete({ where: { id } });

  void writeAuditLog(actorId, 'SUPER_ADMIN', 'SYSTEM_SETTING_CHANGED', 'Programme', id, {
    action: 'DELETE',
  });
}
