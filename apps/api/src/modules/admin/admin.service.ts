/**
 * @file admin.service.ts
 * @module modules/admin
 *
 * Business logic for administrative user management in KWASU AMS.
 *
 * Responsibilities:
 * - Paginated user listing with role, status, and search filters
 * - Fetching a single user by ID
 * - Updating user fields with role/scope compatibility validation
 * - Soft-deleting users (sets `deletedAt` and `isActive: false`)
 * - Delegating TOTP resets to the TOTP service
 * - Creating individual user accounts (from Phase 10)
 * - Uploading CSV files to S3 and queuing bulk import jobs (from Phase 10)
 *
 * Security notes:
 * - Sensitive fields (`passwordHash`, `totpSecret`, etc.) are excluded at the
 *   Prisma query level via `select` — never stripped in post-processing.
 * - `ACADEMIC_AFFAIRS` actors are scope-restricted to their `scopeId` at the
 *   database query level, not in memory.
 * - All state-changing operations write an `AuditLog` entry (fire-and-forget).
 * - GPS coordinates are never stored anywhere in this module.
 *
 * Phase 27 note: Replace direct `prisma.auditLog.create` calls with
 * `auditLogQueue.add()` once BullMQ is wired up.
 */

import { randomBytes } from 'crypto';
import { Buffer } from 'node:buffer';
import { type AuditAction, Prisma } from '@prisma/client';
import { validateMatricNumber, validateStaffId, normaliseMatricNumber } from '@kwasu-ams/utils';
import {
  type CreateUserInput,
  type IUserPublic,
  type PaginatedResponse,
  Role,
} from '@kwasu-ams/types';
import { prisma } from '../../lib/prisma.js';
import { uploadToS3 } from '../../lib/s3.js';
import { hashPassword } from '../../lib/argon2.js';
import { AppError } from '../../middleware/error-handler.js';
import { env } from '../../config/env.js';
import * as totpService from '../auth/totp.service.js';
import { type ListUsersQuery, type UpdateUserInput } from './admin.schema.js';

// =============================================================================
// Prisma select — IUserPublic fields only
// =============================================================================

/**
 * Prisma `select` object that returns only the fields included in `IUserPublic`.
 *
 * Applied to every user query in this module to ensure sensitive fields
 * (`passwordHash`, `totpSecret`, `totpBackupCodes`, `failedAttempts`,
 * `lockoutUntil`) are never fetched from the database.
 */
const USER_PUBLIC_SELECT = {
  id: true,
  identifier: true,
  fullName: true,
  email: true,
  phone: true,
  role: true,
  scopeId: true,
  mustChangePassword: true,
  totpEnrolled: true,
  languagePreference: true,
  fcmToken: true,
  isActive: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

// =============================================================================
// Internal helpers
// =============================================================================

/**
 * Writes an immutable audit log entry via a direct Prisma call.
 *
 * Placeholder until Phase 27 introduces BullMQ. Errors are swallowed so that
 * audit log failures never surface to the caller or block the response.
 *
 * @param actorId    - UUID of the admin performing the action.
 * @param actorRole  - Role string of the actor.
 * @param action     - The {@link AuditAction} enum value.
 * @param entityType - Human-readable entity name, e.g. `"User"`.
 * @param entityId   - Optional UUID of the affected entity.
 * @param beforeJson - Optional snapshot of entity state before the change.
 * @param afterJson  - Optional snapshot of entity state after the change.
 * @param metadata   - Optional free-form context object.
 */
async function writeAuditLog(
  actorId: string,
  actorRole: string,
  action: AuditAction,
  entityType: string,
  entityId?: string,
  beforeJson?: Record<string, unknown>,
  afterJson?: Record<string, unknown>,
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
        beforeJson:
          beforeJson !== undefined ? (beforeJson as Prisma.InputJsonValue) : Prisma.JsonNull,
        afterJson: afterJson !== undefined ? (afterJson as Prisma.InputJsonValue) : Prisma.JsonNull,
        metadata: metadata !== undefined ? (metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    });
  } catch {
    // Fire-and-forget — audit failures must not surface to the caller
  }
}

// =============================================================================
// List users
// =============================================================================

/**
 * Returns a paginated list of active (non-deleted) users with optional filters.
 *
 * Scope enforcement:
 * - `SUPER_ADMIN` — no restriction, sees all users.
 * - `ACADEMIC_AFFAIRS` — restricted to users whose `scopeId` matches the actor's
 *   own `scopeId`. This is enforced at the Prisma query level.
 *
 * @param query        - Validated query parameters from {@link ListUsersQuerySchema}.
 * @param actorRole    - Role of the requesting admin (used for scope enforcement).
 * @param actorScopeId - Scope UUID of the requesting admin, or `null` for SUPER_ADMIN.
 * @returns Paginated list of {@link IUserPublic} records with pagination metadata.
 */
export async function listUsers(
  query: ListUsersQuery,
  actorRole: Role,
  actorScopeId: string | null,
): Promise<PaginatedResponse<IUserPublic>> {
  const { page, pageSize, role, isActive, search } = query;

  const where: Prisma.UserWhereInput = { deletedAt: null };

  if (role !== undefined) {
    where.role = role;
  }

  if (isActive !== undefined) {
    where.isActive = isActive;
  }

  if (search !== undefined && search.length > 0) {
    where.OR = [
      { fullName: { contains: search, mode: 'insensitive' } },
      { identifier: { contains: search, mode: 'insensitive' } },
    ];
  }

  // Scope restriction: ACADEMIC_AFFAIRS can only see users in their scope
  if (actorRole === Role.ACADEMIC_AFFAIRS && actorScopeId !== null) {
    where.scopeId = actorScopeId;
  }

  const skip = (page - 1) * pageSize;

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: USER_PUBLIC_SELECT,
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.user.count({ where }),
  ]);

  return {
    data: users as IUserPublic[],
    meta: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

// =============================================================================
// Get user by ID
// =============================================================================

/**
 * Fetches a single active user by their UUID.
 *
 * @param id - UUID of the user to fetch.
 * @returns The user record as {@link IUserPublic} (sensitive fields omitted).
 * @throws {AppError} `NOT_FOUND` (404) — user does not exist or has been soft-deleted.
 */
export async function getUserById(id: string): Promise<IUserPublic> {
  const user = await prisma.user.findUnique({
    where: { id, deletedAt: null },
    select: USER_PUBLIC_SELECT,
  });

  if (!user) {
    throw new AppError('NOT_FOUND', 'User not found.', 404);
  }

  return user as IUserPublic;
}

// =============================================================================
// Update user
// =============================================================================

/**
 * Updates a user's profile fields and/or role/scope assignment.
 *
 * Role change validation: if `data.role` is provided and differs from the
 * current role, the new role must be compatible with `data.scopeId`:
 * - Roles that require a scope (`HOD`, `DEAN`, `LECTURER`, `EXAM_OFFICER`,
 *   `ACADEMIC_AFFAIRS`) must have a non-null `scopeId` after the update.
 * - Roles with no scope (`SUPER_ADMIN`, `VICE_CHANCELLOR`, `STUDENT`) should
 *   have `scopeId` set to `null`.
 *
 * Writes a `USER_UPDATED` AuditLog entry with before/after snapshots.
 *
 * @param id      - UUID of the user to update.
 * @param data    - Validated partial update payload from {@link UpdateUserSchema}.
 * @param actorId - UUID of the admin performing the update (for audit trail).
 * @returns The updated user record as {@link IUserPublic}.
 * @throws {AppError} `NOT_FOUND` (404) — user does not exist or has been soft-deleted.
 * @throws {AppError} `VALIDATION_ERROR` (400) — role change is incompatible with the provided scopeId.
 */
export async function updateUser(
  id: string,
  data: UpdateUserInput,
  actorId: string,
): Promise<IUserPublic> {
  const existing = await prisma.user.findUnique({
    where: { id, deletedAt: null },
    select: { ...USER_PUBLIC_SELECT, role: true, scopeId: true },
  });

  if (!existing) {
    throw new AppError('NOT_FOUND', 'User not found.', 404);
  }

  // Validate role/scopeId compatibility when role is being changed
  if (data.role !== undefined && data.role !== existing.role) {
    const newScopeId = data.scopeId !== undefined ? data.scopeId : existing.scopeId;
    const scopedRoles: Role[] = [
      Role.HOD,
      Role.DEAN,
      Role.LECTURER,
      Role.EXAM_OFFICER,
      Role.ACADEMIC_AFFAIRS,
    ];
    const unscopedRoles: Role[] = [Role.SUPER_ADMIN, Role.VICE_CHANCELLOR];

    if (scopedRoles.includes(data.role) && newScopeId === null) {
      throw new AppError(
        'VALIDATION_ERROR',
        `Role ${data.role} requires a scopeId (faculty or department UUID).`,
        400,
        'scopeId',
      );
    }

    if (unscopedRoles.includes(data.role) && newScopeId !== null && newScopeId !== undefined) {
      throw new AppError(
        'VALIDATION_ERROR',
        `Role ${data.role} must not have a scopeId.`,
        400,
        'scopeId',
      );
    }
  }

  const updated = await prisma.user.update({
    where: { id },
    data: {
      ...(data.fullName !== undefined && { fullName: data.fullName }),
      ...(data.email !== undefined && { email: data.email }),
      ...(data.phone !== undefined && { phone: data.phone }),
      ...(data.role !== undefined && { role: data.role as never }),
      ...(data.scopeId !== undefined && { scopeId: data.scopeId }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
    },
    select: USER_PUBLIC_SELECT,
  });

  void writeAuditLog(
    actorId,
    'SUPER_ADMIN',
    'USER_UPDATED',
    'User',
    id,
    existing as Record<string, unknown>,
    updated as Record<string, unknown>,
  );

  return updated as IUserPublic;
}

// =============================================================================
// Delete user (soft)
// =============================================================================

/**
 * Soft-deletes a user by setting `deletedAt = now()` and `isActive = false`.
 *
 * The user record is never hard-deleted. Soft-deleted users cannot log in
 * (the `authenticate` middleware checks `deletedAt` and `isActive`).
 *
 * Writes a `USER_DELETED` AuditLog entry.
 *
 * @param id      - UUID of the user to soft-delete.
 * @param actorId - UUID of the SUPER_ADMIN performing the deletion (for audit trail).
 * @returns A promise that resolves once the soft-delete is complete.
 * @throws {AppError} `NOT_FOUND` (404) — user does not exist or is already soft-deleted.
 */
export async function deleteUser(id: string, actorId: string): Promise<void> {
  const existing = await prisma.user.findUnique({
    where: { id, deletedAt: null },
    select: { id: true },
  });

  if (!existing) {
    throw new AppError('NOT_FOUND', 'User not found.', 404);
  }

  await prisma.user.update({
    where: { id },
    data: { deletedAt: new Date(), isActive: false },
  });

  void writeAuditLog(actorId, 'SUPER_ADMIN', 'USER_DELETED', 'User', id);
}

// =============================================================================
// Reset user TOTP
// =============================================================================

/**
 * Resets a user's TOTP enrollment, forcing them to re-enroll on next login.
 *
 * Delegates entirely to {@link totpService.adminResetTotp}. Restricted to
 * `SUPER_ADMIN` via the route's `requireRoles` preHandler.
 *
 * @param targetUserId - UUID of the user whose TOTP enrollment is being reset.
 * @param actorId      - UUID of the SUPER_ADMIN performing the reset (for audit trail).
 * @returns A promise that resolves once the reset is complete.
 * @throws {AppError} `NOT_FOUND` (404) — target user does not exist.
 */
export async function resetUserTotp(targetUserId: string, actorId: string): Promise<void> {
  await totpService.adminResetTotp(targetUserId, actorId);
}

// =============================================================================
// Create user (Phase 10)
// =============================================================================

/**
 * Provisions a new user account with a system-generated temporary password.
 *
 * The temporary password is delivered to the user's phone via SMS (Phase 25).
 * The account is created with `mustChangePassword: true`, forcing a password
 * change on first login.
 *
 * @param data      - Validated user creation payload from {@link CreateUserSchema}.
 * @param actorId   - UUID of the admin creating the account.
 * @param actorRole - Role string of the admin (for audit log).
 * @returns The created user record with sensitive fields omitted (`IUserPublic`).
 * @throws {AppError} `VALIDATION_ERROR` (400) — identifier format does not match the role.
 * @throws {AppError} `CONFLICT` (409) — identifier already exists in the database.
 */
export async function createUser(
  data: CreateUserInput,
  actorId: string,
  actorRole: string,
): Promise<IUserPublic> {
  // Validate identifier format against the expected pattern for the given role
  const isStudentRole = data.role === Role.STUDENT;
  const isMatric = validateMatricNumber(data.identifier);
  const isStaff = validateStaffId(data.identifier);

  if (isStudentRole && !isMatric) {
    throw new AppError('VALIDATION_ERROR', 'Invalid matric number format.', 400, 'identifier');
  }
  if (!isStudentRole && !isStaff) {
    throw new AppError('VALIDATION_ERROR', 'Invalid staff ID format.', 400, 'identifier');
  }

  // Normalise matric numbers to uppercase; staff IDs are stored as submitted
  const normalisedIdentifier = isMatric ? normaliseMatricNumber(data.identifier) : data.identifier;

  // Reject duplicate identifiers before attempting to create
  const existing = await prisma.user.findUnique({
    where: { identifier: normalisedIdentifier },
    select: { id: true },
  });
  if (existing) {
    throw new AppError('CONFLICT', 'Identifier already exists.', 409, 'identifier');
  }

  // Generate a cryptographically random 12-character URL-safe temporary password
  const tempPassword = randomBytes(9).toString('base64url');
  const passwordHash = await hashPassword(tempPassword);

  const user = await prisma.user.create({
    data: {
      identifier: normalisedIdentifier,
      fullName: data.fullName,
      email: data.email,
      phone: data.phone,
      role: data.role as never,
      scopeId: data.scopeId ?? null,
      passwordHash,
      mustChangePassword: true,
      totpEnrolled: false,
    },
    select: USER_PUBLIC_SELECT,
  });

  // TODO Phase 25: enqueue SMS job to deliver tempPassword to user.phone
  // void smsQueue.add('send-sms', { to: user.phone, message: `Your KWASU AMS temporary password: ${tempPassword}` });

  void writeAuditLog(actorId, actorRole, 'USER_CREATED', 'User', user.id, undefined, undefined, {
    identifier: normalisedIdentifier,
    role: data.role,
  });

  return user as IUserPublic;
}

// =============================================================================
// Bulk import (Phase 10)
// =============================================================================

/**
 * Initiates a bulk user import from a CSV file.
 *
 * The CSV buffer is uploaded to S3 first, then a BullMQ job is queued to
 * process it asynchronously. The endpoint returns immediately with a `jobId`
 * so the client can poll for completion.
 *
 * S3 key format: `imports/{timestamp}-{actorId}.csv`
 *
 * @param csvBuffer - Raw CSV file content as a Node.js Buffer.
 * @param actorId   - UUID of the admin triggering the import.
 * @param actorRole - Role string of the admin (for audit log).
 * @returns Object containing the `jobId` for polling.
 * @throws Will propagate S3 upload errors if the upload fails.
 */
export async function importUsers(
  csvBuffer: Buffer,
  actorId: string,
  actorRole: string,
): Promise<{ jobId: string }> {
  const timestamp = Date.now();
  const s3Key = `imports/${timestamp}-${actorId}.csv`;

  // Upload CSV to S3 before queuing — prevents large files from blocking the thread
  await uploadToS3(env.AWS_S3_BUCKET_REPORTS, s3Key, csvBuffer, 'text/csv');

  void writeAuditLog(
    actorId,
    actorRole,
    'BULK_IMPORT_STARTED',
    'User',
    undefined,
    undefined,
    undefined,
    { s3Key },
  );

  // TODO Phase 27: replace with BullMQ job
  // void bulkImportQueue.add('bulk-account-creation', { csvS3Key: s3Key, actorId });
  const jobId = `bulk-${timestamp}`;

  return { jobId };
}

// =============================================================================
// Academic Sessions
// =============================================================================

/**
 * Input shape for creating an academic session.
 */
export interface CreateAcademicSessionInput {
  /** Display name, e.g. `"2024/2025"`. Must be unique. */
  name: string;
  /** Session start date. */
  startDate: Date;
  /** Session end date. */
  endDate: Date;
}

/**
 * Creates a new academic session with `isActive: false`.
 *
 * The session must be explicitly activated via {@link activateAcademicSession}.
 * Writes a `SYSTEM_SETTING_CHANGED` AuditLog entry on success.
 *
 * @param data    - Session creation payload.
 * @param actorId - UUID of the admin creating the session (for audit trail).
 * @returns The created academic session record.
 * @throws {AppError} `CONFLICT` (409) — a session with the same name already exists.
 */
export async function createAcademicSession(
  data: CreateAcademicSessionInput,
  actorId: string,
): Promise<import('@kwasu-ams/types').IAcademicSession> {
  const existing = await prisma.academicSession.findUnique({
    where: { name: data.name },
    select: { id: true },
  });
  if (existing) {
    throw new AppError('CONFLICT', `Academic session "${data.name}" already exists.`, 409, 'name');
  }

  const session = await prisma.academicSession.create({
    data: { name: data.name, startDate: data.startDate, endDate: data.endDate, isActive: false },
  });

  void writeAuditLog(
    actorId,
    'SUPER_ADMIN',
    'SYSTEM_SETTING_CHANGED',
    'AcademicSession',
    session.id,
    undefined,
    undefined,
    {
      action: 'CREATE',
      name: data.name,
    },
  );

  return session;
}

/**
 * Returns all academic sessions ordered by start date descending.
 *
 * @returns Array of all academic session records.
 */
export async function listAcademicSessions(): Promise<
  import('@kwasu-ams/types').IAcademicSession[]
> {
  return prisma.academicSession.findMany({ orderBy: { startDate: 'desc' } });
}

/**
 * Activates an academic session, deactivating all others atomically.
 *
 * Uses a Prisma transaction to ensure only one session is active at a time.
 * Writes a `SYSTEM_SETTING_CHANGED` AuditLog entry on success.
 *
 * @param id      - UUID of the session to activate.
 * @param actorId - UUID of the SUPER_ADMIN performing the activation (for audit trail).
 * @returns The activated academic session record.
 * @throws {AppError} `NOT_FOUND` (404) — session does not exist.
 */
export async function activateAcademicSession(
  id: string,
  actorId: string,
): Promise<import('@kwasu-ams/types').IAcademicSession> {
  const existing = await prisma.academicSession.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
    throw new AppError('NOT_FOUND', 'Academic session not found.', 404);
  }

  const [, session] = await prisma.$transaction([
    prisma.academicSession.updateMany({ where: { id: { not: id } }, data: { isActive: false } }),
    prisma.academicSession.update({ where: { id }, data: { isActive: true } }),
  ]);

  void writeAuditLog(
    actorId,
    'SUPER_ADMIN',
    'SYSTEM_SETTING_CHANGED',
    'AcademicSession',
    id,
    undefined,
    undefined,
    {
      action: 'ACTIVATE',
    },
  );

  return session;
}

// =============================================================================
// Semesters
// =============================================================================

/**
 * Input shape for creating a semester within an academic session.
 */
export interface CreateSemesterInput {
  /** UUID of the parent academic session. */
  academicSessionId: string;
  /** Semester type: `FIRST`, `SECOND`, or `THIRD`. */
  type: import('@prisma/client').SemesterType;
  /** Semester start date. */
  startDate: Date;
  /** Semester end date. */
  endDate: Date;
  /** Optional date when exams begin (triggers eligibility banner 3 weeks prior). */
  examStartDate?: Date;
  /** Optional date when the eligibility computation BullMQ job runs. */
  eligibilityComputeDate?: Date;
  /** Attendance threshold percentage. Defaults to 75.0 (NUC minimum). */
  eligibilityThreshold?: number;
  /** Number of days students have to appeal eligibility decisions. Defaults to 5. */
  appealWindowDays?: number;
  /** Maximum approved excuses per student per semester. Defaults to 4. */
  maxApprovedExcuses?: number;
}

/**
 * Creates a new semester within an academic session.
 *
 * Writes a `SYSTEM_SETTING_CHANGED` AuditLog entry on success.
 *
 * @param data    - Semester creation payload.
 * @param actorId - UUID of the admin creating the semester (for audit trail).
 * @returns The created semester record.
 * @throws {AppError} `NOT_FOUND` (404) — academic session does not exist.
 * @throws {AppError} `CONFLICT` (409) — a semester of the same type already exists in this session.
 */
export async function createSemester(
  data: CreateSemesterInput,
  actorId: string,
): Promise<import('@kwasu-ams/types').ISemester> {
  const session = await prisma.academicSession.findUnique({
    where: { id: data.academicSessionId },
    select: { id: true },
  });
  if (!session) {
    throw new AppError('NOT_FOUND', 'Academic session not found.', 404, 'academicSessionId');
  }

  const existing = await prisma.semester.findUnique({
    where: {
      academicSessionId_type: { academicSessionId: data.academicSessionId, type: data.type },
    },
    select: { id: true },
  });
  if (existing) {
    throw new AppError(
      'CONFLICT',
      `A ${data.type} semester already exists for this session.`,
      409,
      'type',
    );
  }

  const semester = await prisma.semester.create({
    data: {
      academicSessionId: data.academicSessionId,
      type: data.type,
      startDate: data.startDate,
      endDate: data.endDate,
      examStartDate: data.examStartDate ?? null,
      eligibilityComputeDate: data.eligibilityComputeDate ?? null,
      eligibilityThreshold: data.eligibilityThreshold ?? 75.0,
      appealWindowDays: data.appealWindowDays ?? 5,
      maxApprovedExcuses: data.maxApprovedExcuses ?? 4,
    },
  });

  void writeAuditLog(
    actorId,
    'SUPER_ADMIN',
    'SYSTEM_SETTING_CHANGED',
    'Semester',
    semester.id,
    undefined,
    undefined,
    {
      action: 'CREATE',
      type: data.type,
    },
  );

  return semester as unknown as import('@kwasu-ams/types').ISemester;
}

/**
 * Activates a semester, deactivating all other semesters in the same session atomically.
 *
 * Uses a Prisma transaction to ensure only one semester per session is active.
 * Writes a `SYSTEM_SETTING_CHANGED` AuditLog entry on success.
 *
 * @param id      - UUID of the semester to activate.
 * @param actorId - UUID of the SUPER_ADMIN performing the activation (for audit trail).
 * @returns The activated semester record.
 * @throws {AppError} `NOT_FOUND` (404) — semester does not exist.
 */
export async function activateSemester(
  id: string,
  actorId: string,
): Promise<import('@kwasu-ams/types').ISemester> {
  const existing = await prisma.semester.findUnique({
    where: { id },
    select: { id: true, academicSessionId: true },
  });
  if (!existing) {
    throw new AppError('NOT_FOUND', 'Semester not found.', 404);
  }

  const [, semester] = await prisma.$transaction([
    prisma.semester.updateMany({
      where: { academicSessionId: existing.academicSessionId, id: { not: id } },
      data: { isActive: false },
    }),
    prisma.semester.update({ where: { id }, data: { isActive: true } }),
  ]);

  void writeAuditLog(
    actorId,
    'SUPER_ADMIN',
    'SYSTEM_SETTING_CHANGED',
    'Semester',
    id,
    undefined,
    undefined,
    {
      action: 'ACTIVATE',
    },
  );

  return semester as unknown as import('@kwasu-ams/types').ISemester;
}

/**
 * Freezes a semester by setting `isFrozen = true`.
 *
 * Once frozen, eligibility changes require `DEAN` approval (enforced in Phase 24).
 * Writes a `SYSTEM_SETTING_CHANGED` AuditLog entry on success.
 *
 * @param id      - UUID of the semester to freeze.
 * @param actorId - UUID of the SUPER_ADMIN performing the freeze (for audit trail).
 * @returns The frozen semester record.
 * @throws {AppError} `NOT_FOUND` (404) — semester does not exist.
 */
export async function freezeSemester(
  id: string,
  actorId: string,
): Promise<import('@kwasu-ams/types').ISemester> {
  const existing = await prisma.semester.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
    throw new AppError('NOT_FOUND', 'Semester not found.', 404);
  }

  const semester = await prisma.semester.update({ where: { id }, data: { isFrozen: true } });

  void writeAuditLog(
    actorId,
    'SUPER_ADMIN',
    'SYSTEM_SETTING_CHANGED',
    'Semester',
    id,
    undefined,
    undefined,
    {
      action: 'FREEZE',
    },
  );

  return semester as unknown as import('@kwasu-ams/types').ISemester;
}
