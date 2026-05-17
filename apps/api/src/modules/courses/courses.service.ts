/**
 * @file courses.service.ts
 * @module modules/courses
 *
 * Business logic for the courses module.
 *
 * Responsibilities:
 * - Course CRUD with duplicate-code detection and cascade-safety deletion
 * - Scope-aware listing: LECTURER sees only assigned courses; HOD sees only
 *   their department; DEAN sees only their faculty; STUDENT sees only enrolled
 *   courses; SUPER_ADMIN/ACADEMIC_AFFAIRS see all
 * - Course section creation with uniqueness enforcement
 * - Atomic batch enrollment via Prisma transaction with upsert idempotency
 * - Lecturer assignment with same-department enforcement (bypassed for SUPER_ADMIN/ACADEMIC_AFFAIRS)
 * - Paginated student list with per-student attendance summary
 * - Writing AuditLog entries for all state-changing operations (fire-and-forget)
 *
 * Phase 27 note: Replace direct `prisma.auditLog.create` calls with
 * `auditLogQueue.add()` once BullMQ is wired up.
 */

import { type AuditAction, Prisma } from '@prisma/client';
import { type ICourse, type ICourseSection, type PaginatedResponse, Role } from '@kwasu-ams/types';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../middleware/error-handler.js';
import {
  type CreateCourseInput,
  type UpdateCourseInput,
  type ListCoursesQuery,
  type CreateSectionInput,
  type EnrollStudentsInput,
  type AssignLecturerInput,
  type ListCourseStudentsQuery,
} from './courses.schema.js';

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
 * @param entityType - Human-readable entity name, e.g. `"Course"`.
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
// Prisma select — ICourse fields + section count
// =============================================================================

/**
 * Prisma `select` object that returns all `ICourse` fields plus
 * `_count.sections` aggregate for summary display.
 */
const COURSE_SELECT = {
  id: true,
  departmentId: true,
  code: true,
  title: true,
  creditUnits: true,
  level: true,
  isElective: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { sections: true } },
} as const;

/**
 * Prisma `select` object that returns all `ICourseSection` fields.
 */
const SECTION_SELECT = {
  id: true,
  courseId: true,
  semesterId: true,
  sectionLabel: true,
  lecturerId: true,
  maxEnrollment: true,
  createdAt: true,
  updatedAt: true,
} as const;

// =============================================================================
// createCourse
// =============================================================================

/**
 * Creates a new course record.
 *
 * Rejects duplicate `code` values with a `CONFLICT` error.
 * Writes a `SYSTEM_SETTING_CHANGED` AuditLog entry on success.
 *
 * @param data    - Validated creation payload from {@link CreateCourseSchema}.
 * @param actorId - UUID of the admin creating the course (for audit trail).
 * @returns The created course record as {@link ICourse}.
 * @throws {AppError} `CONFLICT` (409) — a course with the same code already exists.
 */
export async function createCourse(data: CreateCourseInput, actorId: string): Promise<ICourse> {
  const existing = await prisma.course.findUnique({
    where: { code: data.code },
    select: { id: true },
  });
  if (existing) {
    throw new AppError('CONFLICT', `Course code "${data.code}" already exists.`, 409, 'code');
  }

  const course = await prisma.course.create({
    data: {
      departmentId: data.departmentId,
      code: data.code,
      title: data.title,
      creditUnits: data.creditUnits,
      level: data.level,
      isElective: data.isElective,
    },
    select: COURSE_SELECT,
  });

  void writeAuditLog(actorId, 'SUPER_ADMIN', 'SYSTEM_SETTING_CHANGED', 'Course', course.id, {
    action: 'CREATE',
    code: data.code,
  });

  return course as ICourse;
}

// =============================================================================
// listCourses
// =============================================================================

/**
 * Returns a paginated, scope-aware list of courses.
 *
 * Scope rules (enforced at the Prisma query level):
 * - `LECTURER` — only courses where they are assigned to a `CourseSection`.
 * - `HOD` — only courses in their department (`actorScopeId = departmentId`).
 * - `DEAN` — only courses in their faculty (join through department).
 * - `STUDENT` — only courses they are enrolled in (join through enrollments).
 * - `SUPER_ADMIN`, `ACADEMIC_AFFAIRS`, `VICE_CHANCELLOR` — all courses,
 *   optionally filtered by `query.departmentId`.
 *
 * @param query        - Validated query params from {@link ListCoursesQuerySchema}.
 * @param actorRole    - Role of the requesting user (used for scope enforcement).
 * @param actorScopeId - Scope UUID of the requesting user, or `null` for SUPER_ADMIN.
 * @param actorId      - UUID of the requesting user (used for LECTURER/STUDENT scope).
 * @returns Paginated list of {@link ICourse} records with `meta` object.
 */
export async function listCourses(
  query: ListCoursesQuery,
  actorRole: Role,
  actorScopeId: string | null,
  actorId: string,
): Promise<PaginatedResponse<ICourse>> {
  const { page, pageSize, departmentId, level, semesterId } = query;
  const skip = (page - 1) * pageSize;

  const where: Prisma.CourseWhereInput = {};

  if (actorRole === Role.LECTURER && actorScopeId !== null) {
    // Lecturer sees only courses where they are assigned to a section
    // actorScopeId for LECTURER is their departmentId; we join through sections
    where.sections = {
      some: {
        lecturer: { userId: actorId },
        ...(semesterId !== undefined && { semesterId }),
      },
    };
  } else if (actorRole === Role.HOD && actorScopeId !== null) {
    where.departmentId = actorScopeId;
  } else if (actorRole === Role.DEAN && actorScopeId !== null) {
    where.department = { facultyId: actorScopeId };
  } else if (actorRole === Role.STUDENT) {
    // Student sees only courses they are enrolled in
    where.sections = {
      some: {
        enrollments: {
          some: { student: { userId: actorId } },
        },
        ...(semesterId !== undefined && { semesterId }),
      },
    };
  } else {
    // SUPER_ADMIN, ACADEMIC_AFFAIRS, VICE_CHANCELLOR — optional filters
    if (departmentId !== undefined) {
      where.departmentId = departmentId;
    }
  }

  if (level !== undefined) {
    where.level = level;
  }

  const [courses, total] = await Promise.all([
    prisma.course.findMany({
      where,
      select: COURSE_SELECT,
      skip,
      take: pageSize,
      orderBy: { code: 'asc' },
    }),
    prisma.course.count({ where }),
  ]);

  return {
    data: courses as ICourse[],
    meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  };
}

// =============================================================================
// getCourseById
// =============================================================================

/**
 * Fetches a single course by UUID, including its sections with enrollment counts.
 *
 * Scope is enforced at the database query level for HOD and DEAN roles.
 *
 * @param id           - UUID of the course to fetch.
 * @param actorRole    - Role of the requesting user (used for scope enforcement).
 * @param actorScopeId - Scope UUID of the requesting user, or `null` for SUPER_ADMIN.
 * @returns The course record with sections included.
 * @throws {AppError} `NOT_FOUND` (404) — course does not exist.
 * @throws {AppError} `FORBIDDEN` (403) — actor's scope does not include this course.
 */
export async function getCourseById(
  id: string,
  actorRole: Role,
  actorScopeId: string | null,
): Promise<ICourse & { sections: ICourseSection[] }> {
  const course = await prisma.course.findUnique({
    where: { id },
    select: {
      ...COURSE_SELECT,
      sections: {
        select: {
          ...SECTION_SELECT,
          _count: { select: { enrollments: true } },
        },
      },
    },
  });

  if (!course) {
    throw new AppError('NOT_FOUND', 'Course not found.', 404);
  }

  // Scope enforcement
  if (actorRole === Role.HOD && actorScopeId !== null && course.departmentId !== actorScopeId) {
    throw new AppError('FORBIDDEN', 'Insufficient permissions.', 403);
  }

  if (actorRole === Role.DEAN && actorScopeId !== null) {
    const dept = await prisma.department.findUnique({
      where: { id: course.departmentId },
      select: { facultyId: true },
    });
    if (!dept || dept.facultyId !== actorScopeId) {
      throw new AppError('FORBIDDEN', 'Insufficient permissions.', 403);
    }
  }

  return course as ICourse & { sections: ICourseSection[] };
}

// =============================================================================
// updateCourse
// =============================================================================

/**
 * Updates a course's fields (excluding `departmentId`).
 *
 * Rejects duplicate `code` values (excluding the current course).
 * Writes a `SYSTEM_SETTING_CHANGED` AuditLog entry on success.
 *
 * @param id      - UUID of the course to update.
 * @param data    - Validated partial update payload from {@link UpdateCourseSchema}.
 * @param actorId - UUID of the admin performing the update (for audit trail).
 * @returns The updated course record as {@link ICourse}.
 * @throws {AppError} `NOT_FOUND` (404) — course does not exist.
 * @throws {AppError} `CONFLICT` (409) — new code already used by another course.
 */
export async function updateCourse(
  id: string,
  data: UpdateCourseInput,
  actorId: string,
): Promise<ICourse> {
  const existing = await prisma.course.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
    throw new AppError('NOT_FOUND', 'Course not found.', 404);
  }

  if (data.code !== undefined) {
    const codeConflict = await prisma.course.findFirst({
      where: { code: data.code, id: { not: id } },
      select: { id: true },
    });
    if (codeConflict) {
      throw new AppError('CONFLICT', `Course code "${data.code}" already exists.`, 409, 'code');
    }
  }

  const updated = await prisma.course.update({
    where: { id },
    data: {
      ...(data.code !== undefined && { code: data.code }),
      ...(data.title !== undefined && { title: data.title }),
      ...(data.creditUnits !== undefined && { creditUnits: data.creditUnits }),
      ...(data.level !== undefined && { level: data.level }),
      ...(data.isElective !== undefined && { isElective: data.isElective }),
    },
    select: COURSE_SELECT,
  });

  void writeAuditLog(actorId, 'SUPER_ADMIN', 'SYSTEM_SETTING_CHANGED', 'Course', id, {
    action: 'UPDATE',
  });

  return updated as ICourse;
}

// =============================================================================
// deleteCourse
// =============================================================================

/**
 * Hard-deletes a course after verifying no sessions exist for it.
 *
 * Writes a `SYSTEM_SETTING_CHANGED` AuditLog entry on success.
 *
 * @param id      - UUID of the course to delete.
 * @param actorId - UUID of the SUPER_ADMIN performing the deletion (for audit trail).
 * @returns A promise that resolves once the deletion is complete.
 * @throws {AppError} `NOT_FOUND` (404) — course does not exist.
 * @throws {AppError} `CONFLICT` (409) — course has existing sessions and cannot be deleted.
 */
export async function deleteCourse(id: string, actorId: string): Promise<void> {
  const course = await prisma.course.findUnique({
    where: { id },
    select: {
      id: true,
      _count: {
        select: {
          sections: { where: { sessions: { some: {} } } },
        },
      },
    },
  });

  if (!course) {
    throw new AppError('NOT_FOUND', 'Course not found.', 404);
  }

  // Check for any sessions across all sections
  const sessionCount = await prisma.courseSession.count({
    where: { courseSection: { courseId: id } },
  });

  if (sessionCount > 0) {
    throw new AppError('CONFLICT', 'Cannot delete a course that has existing sessions.', 409);
  }

  await prisma.course.delete({ where: { id } });

  void writeAuditLog(actorId, 'SUPER_ADMIN', 'SYSTEM_SETTING_CHANGED', 'Course', id, {
    action: 'DELETE',
  });
}

// =============================================================================
// createSection
// =============================================================================

/**
 * Creates a new course section for a given course.
 *
 * Enforces uniqueness on `[courseId, semesterId, sectionLabel]`.
 * Writes a `SYSTEM_SETTING_CHANGED` AuditLog entry on success.
 *
 * @param courseId - UUID of the parent course.
 * @param data     - Validated creation payload from {@link CreateSectionSchema}.
 * @param actorId  - UUID of the admin creating the section (for audit trail).
 * @returns The created course section record as {@link ICourseSection}.
 * @throws {AppError} `NOT_FOUND` (404) — parent course does not exist.
 * @throws {AppError} `CONFLICT` (409) — section with same label already exists for this course/semester.
 */
export async function createSection(
  courseId: string,
  data: CreateSectionInput,
  actorId: string,
): Promise<ICourseSection> {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true } });
  if (!course) {
    throw new AppError('NOT_FOUND', 'Course not found.', 404);
  }

  const existing = await prisma.courseSection.findUnique({
    where: {
      courseId_semesterId_sectionLabel: {
        courseId,
        semesterId: data.semesterId,
        sectionLabel: data.sectionLabel,
      },
    },
    select: { id: true },
  });
  if (existing) {
    throw new AppError(
      'CONFLICT',
      `Section "${data.sectionLabel}" already exists for this course and semester.`,
      409,
      'sectionLabel',
    );
  }

  const section = await prisma.courseSection.create({
    data: {
      courseId,
      semesterId: data.semesterId,
      sectionLabel: data.sectionLabel,
      lecturerId: data.lecturerId ?? null,
      maxEnrollment: data.maxEnrollment,
    },
    select: SECTION_SELECT,
  });

  void writeAuditLog(
    actorId,
    'SUPER_ADMIN',
    'SYSTEM_SETTING_CHANGED',
    'CourseSection',
    section.id,
    {
      action: 'CREATE',
      courseId,
      sectionLabel: data.sectionLabel,
    },
  );

  return section as ICourseSection;
}

// =============================================================================
// enrollStudents
// =============================================================================

/**
 * Result shape returned by {@link enrollStudents}.
 */
export interface EnrollStudentsResult {
  /** Number of students newly enrolled. */
  enrolled: number;
  /** Number of students skipped because they were already enrolled. */
  skipped: number;
}

/**
 * Atomically batch-enrolls students into a course section.
 *
 * Algorithm:
 * 1. Verify the `CourseSection` exists.
 * 2. Check that `currentEnrollmentCount + newStudents.length ≤ maxEnrollment`.
 * 3. Verify all `studentIds` exist in the `students` table.
 * 4. Run a Prisma transaction: upsert each enrollment (idempotent — re-enrolling
 *    an already-enrolled student is a no-op counted as `skipped`).
 * 5. When `isCarryOver: true`, also update `Student.hasCarryOver = true`.
 * 6. Write AuditLog entry.
 *
 * @param courseSectionId - UUID of the target course section.
 * @param data            - Validated enrollment payload from {@link EnrollStudentsSchema}.
 * @param actorId         - UUID of the admin performing the enrollment (for audit trail).
 * @returns `{ enrolled, skipped }` counts.
 * @throws {AppError} `NOT_FOUND` (404) — course section does not exist.
 * @throws {AppError} `NOT_FOUND` (404) — one or more student IDs do not exist.
 * @throws {AppError} `CONFLICT` (409) — enrollment would exceed `maxEnrollment`.
 */
export async function enrollStudents(
  courseSectionId: string,
  data: EnrollStudentsInput,
  actorId: string,
): Promise<EnrollStudentsResult> {
  // 1. Verify section exists
  const section = await prisma.courseSection.findUnique({
    where: { id: courseSectionId },
    select: { id: true, maxEnrollment: true, courseId: true },
  });
  if (!section) {
    throw new AppError('NOT_FOUND', 'Course section not found.', 404);
  }

  // 2. Check enrollment capacity (outside transaction for early rejection)
  const currentCount = await prisma.courseEnrollment.count({
    where: { courseSectionId, droppedAt: null },
  });
  if (currentCount + data.studentIds.length > section.maxEnrollment) {
    throw new AppError(
      'CONFLICT',
      `Enrollment limit exceeded. Section capacity is ${section.maxEnrollment}, currently ${currentCount} enrolled.`,
      409,
    );
  }

  // 3. Verify all student IDs exist
  const students = await prisma.student.findMany({
    where: { id: { in: data.studentIds } },
    select: { id: true },
  });
  if (students.length !== data.studentIds.length) {
    const foundIds = new Set(students.map((s) => s.id));
    const missing = data.studentIds.filter((id) => !foundIds.has(id));
    throw new AppError(
      'NOT_FOUND',
      `The following student IDs do not exist: ${missing.join(', ')}`,
      404,
    );
  }

  // 4. Atomic transaction: upsert enrollments + carry-over flag
  let enrolled = 0;
  let skipped = 0;

  await prisma.$transaction(async (tx) => {
    // Re-check capacity inside transaction to prevent race conditions
    const countInTx = await tx.courseEnrollment.count({
      where: { courseSectionId, droppedAt: null },
    });
    if (countInTx + data.studentIds.length > section.maxEnrollment) {
      throw new AppError(
        'CONFLICT',
        `Enrollment limit exceeded. Section capacity is ${section.maxEnrollment}.`,
        409,
      );
    }

    for (const studentId of data.studentIds) {
      const existing = await tx.courseEnrollment.findUnique({
        where: { studentId_courseSectionId: { studentId, courseSectionId } },
        select: { id: true },
      });

      if (existing) {
        skipped++;
      } else {
        await tx.courseEnrollment.create({
          data: {
            studentId,
            courseSectionId,
            isCarryOver: data.isCarryOver,
          },
        });
        enrolled++;
      }
    }

    // 5. Update hasCarryOver flag for carry-over enrollments
    if (data.isCarryOver && enrolled > 0) {
      await tx.student.updateMany({
        where: { id: { in: data.studentIds } },
        data: { hasCarryOver: true },
      });
    }
  });

  // 6. Write audit log
  void writeAuditLog(
    actorId,
    'SUPER_ADMIN',
    'SYSTEM_SETTING_CHANGED',
    'CourseEnrollment',
    courseSectionId,
    {
      action: 'BATCH_ENROLL',
      enrolled,
      skipped,
      isCarryOver: data.isCarryOver,
    },
  );

  return { enrolled, skipped };
}

// =============================================================================
// assignLecturer
// =============================================================================

/**
 * Assigns a lecturer to a course section.
 *
 * Enforces that the lecturer belongs to the same department as the course,
 * unless the actor is `SUPER_ADMIN` or `ACADEMIC_AFFAIRS` (cross-department allowed).
 * Writes a `SYSTEM_SETTING_CHANGED` AuditLog entry on success.
 *
 * @param courseSectionId - UUID of the target course section.
 * @param data            - Validated payload from {@link AssignLecturerSchema}.
 * @param actorId         - UUID of the admin performing the assignment (for audit trail).
 * @param actorRole       - Role of the actor (used for cross-department bypass check).
 * @returns The updated course section record as {@link ICourseSection}.
 * @throws {AppError} `NOT_FOUND` (404) — course section does not exist.
 * @throws {AppError} `NOT_FOUND` (404) — lecturer does not exist.
 * @throws {AppError} `FORBIDDEN` (403) — lecturer is from a different department (non-admin actors).
 */
export async function assignLecturer(
  courseSectionId: string,
  data: AssignLecturerInput,
  actorId: string,
  actorRole: Role,
): Promise<ICourseSection> {
  // 1. Fetch section with course's departmentId
  const section = await prisma.courseSection.findUnique({
    where: { id: courseSectionId },
    select: {
      id: true,
      course: { select: { departmentId: true } },
    },
  });
  if (!section) {
    throw new AppError('NOT_FOUND', 'Course section not found.', 404);
  }

  // 2. Fetch lecturer
  const lecturer = await prisma.lecturer.findUnique({
    where: { id: data.lecturerId },
    select: { id: true, departmentId: true },
  });
  if (!lecturer) {
    throw new AppError('NOT_FOUND', 'Lecturer not found.', 404);
  }

  // 3. Department check (bypassed for SUPER_ADMIN and ACADEMIC_AFFAIRS)
  if (actorRole !== Role.SUPER_ADMIN && actorRole !== Role.ACADEMIC_AFFAIRS) {
    if (lecturer.departmentId !== section.course.departmentId) {
      throw new AppError(
        'FORBIDDEN',
        'Lecturer must belong to the same department as the course.',
        403,
      );
    }
  }

  // 4. Update section
  const updated = await prisma.courseSection.update({
    where: { id: courseSectionId },
    data: { lecturerId: data.lecturerId },
    select: SECTION_SELECT,
  });

  // 5. Write audit log
  void writeAuditLog(
    actorId,
    actorRole,
    'SYSTEM_SETTING_CHANGED',
    'CourseSection',
    courseSectionId,
    {
      action: 'ASSIGN_LECTURER',
      lecturerId: data.lecturerId,
    },
  );

  return updated as ICourseSection;
}

// =============================================================================
// getCourseStudents
// =============================================================================

/**
 * Attendance summary for a single student in a course section.
 */
export interface StudentAttendanceSummary {
  /** UUID of the student record. */
  studentId: string;
  /** Matric number of the student. */
  matricNumber: string;
  /** Full name of the student. */
  fullName: string;
  /** Total number of sessions in the course section. */
  totalSessions: number;
  /** Number of sessions the student was present. */
  presentCount: number;
  /** Attendance percentage (0–100). */
  percentage: number;
}

/**
 * Returns a paginated list of students enrolled in a course section,
 * each with their attendance summary (total sessions, present count, percentage).
 *
 * @param courseSectionId - UUID of the course section to query.
 * @param query           - Validated pagination params from {@link ListCourseStudentsQuerySchema}.
 * @returns Paginated list of {@link StudentAttendanceSummary} records with `meta` object.
 * @throws {AppError} `NOT_FOUND` (404) — course section does not exist.
 */
export async function getCourseStudents(
  courseSectionId: string,
  query: ListCourseStudentsQuery,
): Promise<PaginatedResponse<StudentAttendanceSummary>> {
  const { page, pageSize } = query;
  const skip = (page - 1) * pageSize;

  const section = await prisma.courseSection.findUnique({
    where: { id: courseSectionId },
    select: { id: true },
  });
  if (!section) {
    throw new AppError('NOT_FOUND', 'Course section not found.', 404);
  }

  // Total sessions in this section
  const totalSessions = await prisma.courseSession.count({
    where: { courseSectionId },
  });

  const [enrollments, total] = await Promise.all([
    prisma.courseEnrollment.findMany({
      where: { courseSectionId, droppedAt: null },
      select: {
        studentId: true,
        student: {
          select: {
            matricNumber: true,
            user: { select: { fullName: true } },
            attendanceRecords: {
              where: {
                session: { courseSectionId },
                status: 'PRESENT',
              },
              select: { id: true },
            },
          },
        },
      },
      skip,
      take: pageSize,
      orderBy: { student: { matricNumber: 'asc' } },
    }),
    prisma.courseEnrollment.count({ where: { courseSectionId, droppedAt: null } }),
  ]);

  const data: StudentAttendanceSummary[] = enrollments.map((e) => {
    const presentCount = e.student.attendanceRecords.length;
    const percentage = totalSessions > 0 ? (presentCount / totalSessions) * 100 : 0;
    return {
      studentId: e.studentId,
      matricNumber: e.student.matricNumber,
      fullName: e.student.user.fullName,
      totalSessions,
      presentCount,
      percentage: Math.round(percentage * 10) / 10,
    };
  });

  return {
    data,
    meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  };
}
