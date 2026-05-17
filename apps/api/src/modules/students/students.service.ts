/**
 * @file students.service.ts
 * @module modules/students
 *
 * Business logic for the students module.
 *
 * Responsibilities:
 * - Creating student records with matric number validation and normalisation
 * - Scope-aware listing: HOD sees only their department; DEAN sees their faculty;
 *   LECTURER sees only students enrolled in their sections
 * - Fetching a single student with user, programme, and enrollment details
 * - Updating student fields
 * - Writing AuditLog entries for all state-changing operations (fire-and-forget)
 *
 * Identity validation uses `validateMatricNumber` and `normaliseMatricNumber`
 * from `@kwasu-ams/utils` — the single source of truth. Never redefined here.
 *
 * Phase 27 note: Replace direct `prisma.auditLog.create` calls with
 * `auditLogQueue.add()` once BullMQ is wired up.
 */

import { type AuditAction, Prisma } from '@prisma/client';
import { type IStudentWithUser, type PaginatedResponse, Role } from '@kwasu-ams/types';
import { validateMatricNumber, normaliseMatricNumber } from '@kwasu-ams/utils';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../middleware/error-handler.js';
import {
  type CreateStudentInput,
  type UpdateStudentInput,
  type ListStudentsQuery,
} from './students.schema.js';

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
 * @param entityType - Human-readable entity name, e.g. `"Student"`.
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
// Prisma select — IStudentWithUser fields
// =============================================================================

/**
 * Prisma `select` object that returns all `IStudentWithUser` fields including
 * the nested user's public fields (no sensitive data).
 */
const STUDENT_SELECT = {
  id: true,
  userId: true,
  matricNumber: true,
  programmeId: true,
  level: true,
  hasCarryOver: true,
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

// =============================================================================
// createStudent
// =============================================================================

/**
 * Creates a new student record after validating and normalising the matric number.
 *
 * Validation steps:
 * 1. Validates `matricNumber` against `MATRIC_NUMBER_REGEX` (from `@kwasu-ams/utils`).
 * 2. Normalises to uppercase.
 * 3. Verifies the linked `userId` exists and has role `STUDENT`.
 * 4. Checks for duplicate `matricNumber`.
 * 5. Creates the `Student` record.
 * 6. Writes AuditLog.
 *
 * @param data    - Validated creation payload from {@link CreateStudentSchema}.
 * @param actorId - UUID of the admin creating the student (for audit trail).
 * @returns The created student record as {@link IStudentWithUser}.
 * @throws {AppError} `VALIDATION_ERROR` (400) — matric number format is invalid.
 * @throws {AppError} `NOT_FOUND` (404) — userId does not exist or is not a STUDENT.
 * @throws {AppError} `CONFLICT` (409) — matric number already registered.
 */
export async function createStudent(
  data: CreateStudentInput,
  actorId: string,
): Promise<IStudentWithUser> {
  // 1. Validate matric number format
  if (!validateMatricNumber(data.matricNumber)) {
    throw new AppError('VALIDATION_ERROR', 'Invalid matric number format.', 400, 'matricNumber');
  }

  // 2. Normalise to uppercase
  const matricNumber = normaliseMatricNumber(data.matricNumber);

  // 3. Verify userId exists and has role STUDENT
  const user = await prisma.user.findUnique({
    where: { id: data.userId, deletedAt: null },
    select: { id: true, role: true },
  });
  if (!user) {
    throw new AppError('NOT_FOUND', 'User not found.', 404, 'userId');
  }
  if (user.role !== 'STUDENT') {
    throw new AppError(
      'VALIDATION_ERROR',
      'User must have role STUDENT to be linked as a student.',
      400,
      'userId',
    );
  }

  // 4. Check duplicate matric number
  const existing = await prisma.student.findUnique({
    where: { matricNumber },
    select: { id: true },
  });
  if (existing) {
    throw new AppError(
      'CONFLICT',
      `Matric number "${matricNumber}" is already registered.`,
      409,
      'matricNumber',
    );
  }

  // 5. Create student record
  const student = await prisma.student.create({
    data: {
      userId: data.userId,
      matricNumber,
      programmeId: data.programmeId,
      level: data.level,
    },
    select: STUDENT_SELECT,
  });

  // 6. Write audit log
  void writeAuditLog(actorId, 'SUPER_ADMIN', 'USER_CREATED', 'Student', student.id, {
    matricNumber,
    programmeId: data.programmeId,
    level: data.level,
  });

  return student as unknown as IStudentWithUser;
}

// =============================================================================
// listStudents
// =============================================================================

/**
 * Returns a paginated, scope-aware list of students.
 *
 * Scope rules (enforced at the Prisma query level):
 * - `HOD` — only students in their department (`programme.departmentId = actorScopeId`).
 * - `DEAN` — only students in their faculty (`programme.department.facultyId = actorScopeId`).
 * - `LECTURER` — only students enrolled in sections taught by this lecturer.
 * - `SUPER_ADMIN`, `ACADEMIC_AFFAIRS`, `EXAM_OFFICER` — all students, optional filters.
 *
 * @param query        - Validated query params from {@link ListStudentsQuerySchema}.
 * @param actorRole    - Role of the requesting user (used for scope enforcement).
 * @param actorScopeId - Scope UUID of the requesting user, or `null` for SUPER_ADMIN.
 * @param actorId      - UUID of the requesting user (used for LECTURER scope).
 * @returns Paginated list of {@link IStudentWithUser} records with `meta` object.
 */
export async function listStudents(
  query: ListStudentsQuery,
  actorRole: Role,
  actorScopeId: string | null,
  actorId: string,
): Promise<PaginatedResponse<IStudentWithUser>> {
  const { page, pageSize, programmeId, level, search } = query;
  const skip = (page - 1) * pageSize;

  const where: Prisma.StudentWhereInput = {};

  if (actorRole === Role.HOD && actorScopeId !== null) {
    where.programme = { departmentId: actorScopeId };
  } else if (actorRole === Role.DEAN && actorScopeId !== null) {
    where.programme = { department: { facultyId: actorScopeId } };
  } else if (actorRole === Role.LECTURER) {
    where.enrollments = {
      some: { courseSection: { lecturer: { userId: actorId } } },
    };
  }

  if (programmeId !== undefined) where.programmeId = programmeId;
  if (level !== undefined) where.level = level;
  if (search !== undefined && search.length > 0) {
    where.OR = [
      { matricNumber: { contains: search, mode: 'insensitive' } },
      { user: { fullName: { contains: search, mode: 'insensitive' } } },
    ];
  }

  const [students, total] = await Promise.all([
    prisma.student.findMany({
      where,
      select: STUDENT_SELECT,
      skip,
      take: pageSize,
      orderBy: { matricNumber: 'asc' },
    }),
    prisma.student.count({ where }),
  ]);

  return {
    data: students as unknown as IStudentWithUser[],
    meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  };
}

// =============================================================================
// getStudentById
// =============================================================================

/**
 * Fetches a single student by UUID with user, programme, and enrollment details.
 *
 * @param id - UUID of the student record to fetch.
 * @returns The student record as {@link IStudentWithUser} with nested relations.
 * @throws {AppError} `NOT_FOUND` (404) — student does not exist.
 */
export async function getStudentById(id: string): Promise<IStudentWithUser> {
  const student = await prisma.student.findUnique({
    where: { id },
    select: {
      ...STUDENT_SELECT,
      programme: { select: { name: true, code: true } },
      enrollments: {
        select: {
          id: true,
          isCarryOver: true,
          courseSection: {
            select: {
              sectionLabel: true,
              course: { select: { code: true, title: true, creditUnits: true } },
            },
          },
        },
      },
    },
  });

  if (!student) {
    throw new AppError('NOT_FOUND', 'Student not found.', 404);
  }

  return student as unknown as IStudentWithUser;
}

// =============================================================================
// updateStudent
// =============================================================================

/**
 * Partially updates a student's programme, level, or carry-over flag.
 *
 * Writes a `USER_UPDATED` AuditLog entry on success.
 *
 * @param id      - UUID of the student record to update.
 * @param data    - Validated partial update payload from {@link UpdateStudentSchema}.
 * @param actorId - UUID of the admin performing the update (for audit trail).
 * @returns The updated student record as {@link IStudentWithUser}.
 * @throws {AppError} `NOT_FOUND` (404) — student does not exist.
 */
export async function updateStudent(
  id: string,
  data: UpdateStudentInput,
  actorId: string,
): Promise<IStudentWithUser> {
  const existing = await prisma.student.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
    throw new AppError('NOT_FOUND', 'Student not found.', 404);
  }

  const updated = await prisma.student.update({
    where: { id },
    data: {
      ...(data.programmeId !== undefined && { programmeId: data.programmeId }),
      ...(data.level !== undefined && { level: data.level }),
      ...(data.hasCarryOver !== undefined && { hasCarryOver: data.hasCarryOver }),
    },
    select: STUDENT_SELECT,
  });

  void writeAuditLog(actorId, 'SUPER_ADMIN', 'USER_UPDATED', 'Student', id, {
    action: 'UPDATE',
  });

  return updated as unknown as IStudentWithUser;
}
