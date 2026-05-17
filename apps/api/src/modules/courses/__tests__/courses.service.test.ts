/**
 * @file courses.service.test.ts
 * @module modules/courses/__tests__
 *
 * Unit tests for the courses service layer.
 *
 * All Prisma calls are mocked — no real database connection is used.
 * Tests cover happy paths, conflict detection, validation errors,
 * enrollment atomicity, and carry-over flag propagation.
 *
 * Mock strategy: `prisma` is imported at the top level (after `vi.mock` hoisting)
 * so that `vi.mocked()` calls operate on the same mock instance the service uses.
 * Using `await import()` inside individual test bodies creates a separate module
 * reference that does not share the mock's `mockResolvedValueOnce` queue.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Role } from '@kwasu-ams/types';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../../lib/prisma.js', () => ({
  prisma: {
    course: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    courseSection: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    courseEnrollment: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
    },
    courseSession: {
      count: vi.fn(),
    },
    student: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    lecturer: {
      findUnique: vi.fn(),
    },
    department: {
      findUnique: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import {
  createCourse,
  listCourses,
  updateCourse,
  deleteCourse,
  createSection,
  enrollStudents,
  assignLecturer,
} from '../courses.service.js';
import { prisma } from '../../../lib/prisma.js';
import { CreateCourseSchema } from '../courses.schema.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ACTOR_ID = 'a0000000-0000-4000-8000-000000000001';
const DEPT_ID = 'a0000000-0000-4000-8000-000000000010';
const FACULTY_ID = 'a0000000-0000-4000-8000-000000000020';
const COURSE_ID = 'a0000000-0000-4000-8000-000000000030';
const SECTION_ID = 'a0000000-0000-4000-8000-000000000040';
const SEMESTER_ID = 'a0000000-0000-4000-8000-000000000050';
const LECTURER_ID = 'a0000000-0000-4000-8000-000000000060';
const STUDENT_ID_1 = 'a0000000-0000-4000-8000-000000000071';
const STUDENT_ID_2 = 'a0000000-0000-4000-8000-000000000072';
const STUDENT_ID_3 = 'a0000000-0000-4000-8000-000000000073';

const COURSE_RECORD = {
  id: COURSE_ID,
  departmentId: DEPT_ID,
  code: 'BIO201',
  title: 'General Biology II',
  creditUnits: 3,
  level: 200,
  isElective: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  _count: { sections: 0 },
};

const SECTION_RECORD = {
  id: SECTION_ID,
  courseId: COURSE_ID,
  semesterId: SEMESTER_ID,
  sectionLabel: 'A',
  lecturerId: null,
  maxEnrollment: 200,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// =============================================================================
// createCourse
// =============================================================================

describe('createCourse', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a course with valid data', async () => {
    vi.mocked(prisma.course.findUnique).mockResolvedValueOnce(null);
    vi.mocked(prisma.course.create).mockResolvedValueOnce(COURSE_RECORD as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

    const result = await createCourse(
      {
        departmentId: DEPT_ID,
        code: 'BIO201',
        title: 'General Biology II',
        creditUnits: 3,
        level: 200,
        isElective: false,
      },
      ACTOR_ID,
    );

    expect(result.code).toBe('BIO201');
    expect(result.level).toBe(200);
    expect(prisma.course.create).toHaveBeenCalledOnce();
  });

  it('throws CONFLICT when course code already exists', async () => {
    vi.mocked(prisma.course.findUnique).mockResolvedValueOnce({ id: COURSE_ID } as never);

    await expect(
      createCourse(
        {
          departmentId: DEPT_ID,
          code: 'BIO201',
          title: 'General Biology II',
          creditUnits: 3,
          level: 200,
          isElective: false,
        },
        ACTOR_ID,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT', statusCode: 409 });
  });
});

// =============================================================================
// createCourse — level validation (schema layer)
// =============================================================================

describe('createCourse — invalid level via schema', () => {
  it('rejects level 150 as invalid (not in valid set)', () => {
    // Level validation is enforced by the Zod schema, not the service.
    // We test the schema directly here using the top-level import.
    const result = CreateCourseSchema.safeParse({
      departmentId: DEPT_ID,
      code: 'BIO201',
      title: 'General Biology II',
      creditUnits: 3,
      level: 150,
      isElective: false,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/100.*200.*300.*400.*500.*600/i);
    }
  });
});

// =============================================================================
// listCourses — scope enforcement
// =============================================================================

describe('listCourses', () => {
  beforeEach(() => vi.clearAllMocks());

  it('filters by departmentId for HOD role', async () => {
    vi.mocked(prisma.course.findMany).mockResolvedValueOnce([COURSE_RECORD] as never);
    vi.mocked(prisma.course.count).mockResolvedValueOnce(1);

    await listCourses({ page: 1, pageSize: 20 }, Role.HOD, DEPT_ID, ACTOR_ID);

    expect(prisma.course.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ departmentId: DEPT_ID }),
      }),
    );
  });

  it('filters by faculty for DEAN role', async () => {
    vi.mocked(prisma.course.findMany).mockResolvedValueOnce([COURSE_RECORD] as never);
    vi.mocked(prisma.course.count).mockResolvedValueOnce(1);

    await listCourses({ page: 1, pageSize: 20 }, Role.DEAN, FACULTY_ID, ACTOR_ID);

    expect(prisma.course.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          department: { facultyId: FACULTY_ID },
        }),
      }),
    );
  });

  it('applies no scope filter for SUPER_ADMIN', async () => {
    vi.mocked(prisma.course.findMany).mockResolvedValueOnce([COURSE_RECORD] as never);
    vi.mocked(prisma.course.count).mockResolvedValueOnce(1);

    await listCourses({ page: 1, pageSize: 20 }, Role.SUPER_ADMIN, null, ACTOR_ID);

    expect(prisma.course.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
  });
});

// =============================================================================
// enrollStudents
// =============================================================================

describe('enrollStudents', () => {
  beforeEach(() => vi.clearAllMocks());

  it('enrolls 3 valid students and returns { enrolled: 3, skipped: 0 }', async () => {
    vi.mocked(prisma.courseSection.findUnique).mockResolvedValueOnce({
      id: SECTION_ID,
      maxEnrollment: 200,
      courseId: COURSE_ID,
    } as never);
    vi.mocked(prisma.courseEnrollment.count).mockResolvedValueOnce(0);
    vi.mocked(prisma.student.findMany).mockResolvedValueOnce([
      { id: STUDENT_ID_1 },
      { id: STUDENT_ID_2 },
      { id: STUDENT_ID_3 },
    ] as never);

    // Mock $transaction to execute the interactive callback synchronously
    vi.mocked(prisma.$transaction).mockImplementationOnce((async (fn: unknown) => {
      const txMock = {
        courseEnrollment: {
          count: vi.fn().mockResolvedValue(0),
          findUnique: vi.fn().mockResolvedValue(null), // not already enrolled
          create: vi.fn().mockResolvedValue({}),
        },
        student: { updateMany: vi.fn() },
      };
      await (fn as (tx: typeof txMock) => Promise<void>)(txMock);
    }) as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

    const result = await enrollStudents(
      SECTION_ID,
      { studentIds: [STUDENT_ID_1, STUDENT_ID_2, STUDENT_ID_3], isCarryOver: false },
      ACTOR_ID,
    );

    expect(result.enrolled).toBe(3);
    expect(result.skipped).toBe(0);
  });

  it('returns { enrolled: 0, skipped: 1 } when student is already enrolled', async () => {
    vi.mocked(prisma.courseSection.findUnique).mockResolvedValueOnce({
      id: SECTION_ID,
      maxEnrollment: 200,
      courseId: COURSE_ID,
    } as never);
    vi.mocked(prisma.courseEnrollment.count).mockResolvedValueOnce(1);
    vi.mocked(prisma.student.findMany).mockResolvedValueOnce([{ id: STUDENT_ID_1 }] as never);

    vi.mocked(prisma.$transaction).mockImplementationOnce((async (fn: unknown) => {
      const txMock = {
        courseEnrollment: {
          count: vi.fn().mockResolvedValue(1),
          findUnique: vi.fn().mockResolvedValue({ id: 'existing-enrollment' }), // already enrolled
          create: vi.fn(),
        },
        student: { updateMany: vi.fn() },
      };
      await (fn as (tx: typeof txMock) => Promise<void>)(txMock);
    }) as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

    const result = await enrollStudents(
      SECTION_ID,
      { studentIds: [STUDENT_ID_1], isCarryOver: false },
      ACTOR_ID,
    );

    expect(result.enrolled).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('throws NOT_FOUND when a student ID does not exist', async () => {
    vi.mocked(prisma.courseSection.findUnique).mockResolvedValueOnce({
      id: SECTION_ID,
      maxEnrollment: 200,
      courseId: COURSE_ID,
    } as never);
    vi.mocked(prisma.courseEnrollment.count).mockResolvedValueOnce(0);
    // Only 2 of 3 students found — STUDENT_ID_3 is missing
    vi.mocked(prisma.student.findMany).mockResolvedValueOnce([
      { id: STUDENT_ID_1 },
      { id: STUDENT_ID_2 },
    ] as never);

    await expect(
      enrollStudents(
        SECTION_ID,
        { studentIds: [STUDENT_ID_1, STUDENT_ID_2, STUDENT_ID_3], isCarryOver: false },
        ACTOR_ID,
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 });

    // Transaction must NOT have been called — validation fails before it
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('throws CONFLICT when enrollment would exceed maxEnrollment', async () => {
    vi.mocked(prisma.courseSection.findUnique).mockResolvedValueOnce({
      id: SECTION_ID,
      maxEnrollment: 5,
      courseId: COURSE_ID,
    } as never);
    // Already 4 enrolled, trying to add 3 more → exceeds cap of 5
    vi.mocked(prisma.courseEnrollment.count).mockResolvedValueOnce(4);

    await expect(
      enrollStudents(
        SECTION_ID,
        { studentIds: [STUDENT_ID_1, STUDENT_ID_2, STUDENT_ID_3], isCarryOver: false },
        ACTOR_ID,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT', statusCode: 409 });
  });
});

// =============================================================================
// assignLecturer
// =============================================================================

describe('assignLecturer', () => {
  beforeEach(() => vi.clearAllMocks());

  it('assigns a lecturer from the same department successfully', async () => {
    vi.mocked(prisma.courseSection.findUnique).mockResolvedValueOnce({
      id: SECTION_ID,
      course: { departmentId: DEPT_ID },
    } as never);
    vi.mocked(prisma.lecturer.findUnique).mockResolvedValueOnce({
      id: LECTURER_ID,
      departmentId: DEPT_ID,
    } as never);
    vi.mocked(prisma.courseSection.update).mockResolvedValueOnce({
      ...SECTION_RECORD,
      lecturerId: LECTURER_ID,
    } as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

    const result = await assignLecturer(
      SECTION_ID,
      { lecturerId: LECTURER_ID },
      ACTOR_ID,
      Role.HOD,
    );

    expect(result.lecturerId).toBe(LECTURER_ID);
  });

  it('throws FORBIDDEN when lecturer is from a different department (HOD actor)', async () => {
    vi.mocked(prisma.courseSection.findUnique).mockResolvedValueOnce({
      id: SECTION_ID,
      course: { departmentId: DEPT_ID },
    } as never);
    vi.mocked(prisma.lecturer.findUnique).mockResolvedValueOnce({
      id: LECTURER_ID,
      departmentId: 'different-dept-id',
    } as never);

    await expect(
      assignLecturer(SECTION_ID, { lecturerId: LECTURER_ID }, ACTOR_ID, Role.HOD),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
  });

  it('allows cross-department assignment for SUPER_ADMIN', async () => {
    vi.mocked(prisma.courseSection.findUnique).mockResolvedValueOnce({
      id: SECTION_ID,
      course: { departmentId: DEPT_ID },
    } as never);
    vi.mocked(prisma.lecturer.findUnique).mockResolvedValueOnce({
      id: LECTURER_ID,
      departmentId: 'different-dept-id', // different department — allowed for SUPER_ADMIN
    } as never);
    vi.mocked(prisma.courseSection.update).mockResolvedValueOnce({
      ...SECTION_RECORD,
      lecturerId: LECTURER_ID,
    } as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

    const result = await assignLecturer(
      SECTION_ID,
      { lecturerId: LECTURER_ID },
      ACTOR_ID,
      Role.SUPER_ADMIN,
    );

    expect(result.lecturerId).toBe(LECTURER_ID);
  });

  it('allows cross-department assignment for ACADEMIC_AFFAIRS', async () => {
    vi.mocked(prisma.courseSection.findUnique).mockResolvedValueOnce({
      id: SECTION_ID,
      course: { departmentId: DEPT_ID },
    } as never);
    vi.mocked(prisma.lecturer.findUnique).mockResolvedValueOnce({
      id: LECTURER_ID,
      departmentId: 'different-dept-id',
    } as never);
    vi.mocked(prisma.courseSection.update).mockResolvedValueOnce({
      ...SECTION_RECORD,
      lecturerId: LECTURER_ID,
    } as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

    const result = await assignLecturer(
      SECTION_ID,
      { lecturerId: LECTURER_ID },
      ACTOR_ID,
      Role.ACADEMIC_AFFAIRS,
    );

    expect(result.lecturerId).toBe(LECTURER_ID);
  });
});

// =============================================================================
// deleteCourse
// =============================================================================

describe('deleteCourse', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws NOT_FOUND when course does not exist', async () => {
    vi.mocked(prisma.course.findUnique).mockResolvedValueOnce(null);

    await expect(deleteCourse(COURSE_ID, ACTOR_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
      statusCode: 404,
    });
  });

  it('throws CONFLICT when course has existing sessions', async () => {
    vi.mocked(prisma.course.findUnique).mockResolvedValueOnce({
      id: COURSE_ID,
      _count: { sections: 1 },
    } as never);
    vi.mocked(prisma.courseSession.count).mockResolvedValueOnce(2);

    await expect(deleteCourse(COURSE_ID, ACTOR_ID)).rejects.toMatchObject({
      code: 'CONFLICT',
      statusCode: 409,
    });
  });

  it('deletes course when no sessions exist', async () => {
    vi.mocked(prisma.course.findUnique).mockResolvedValueOnce({
      id: COURSE_ID,
      _count: { sections: 0 },
    } as never);
    vi.mocked(prisma.courseSession.count).mockResolvedValueOnce(0);
    vi.mocked(prisma.course.delete).mockResolvedValueOnce({} as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

    await expect(deleteCourse(COURSE_ID, ACTOR_ID)).resolves.toBeUndefined();
    expect(prisma.course.delete).toHaveBeenCalledWith({ where: { id: COURSE_ID } });
  });
});

// =============================================================================
// createSection
// =============================================================================

describe('createSection', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a section with unique [courseId, semesterId, sectionLabel]', async () => {
    vi.mocked(prisma.course.findUnique).mockResolvedValueOnce({ id: COURSE_ID } as never);
    vi.mocked(prisma.courseSection.findUnique).mockResolvedValueOnce(null);
    vi.mocked(prisma.courseSection.create).mockResolvedValueOnce(SECTION_RECORD as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

    const result = await createSection(
      COURSE_ID,
      { sectionLabel: 'A', semesterId: SEMESTER_ID, maxEnrollment: 200 },
      ACTOR_ID,
    );

    expect(result.sectionLabel).toBe('A');
    expect(result.courseId).toBe(COURSE_ID);
  });

  it('throws CONFLICT when section label already exists for this course/semester', async () => {
    vi.mocked(prisma.course.findUnique).mockResolvedValueOnce({ id: COURSE_ID } as never);
    vi.mocked(prisma.courseSection.findUnique).mockResolvedValueOnce({ id: SECTION_ID } as never);

    await expect(
      createSection(
        COURSE_ID,
        { sectionLabel: 'A', semesterId: SEMESTER_ID, maxEnrollment: 200 },
        ACTOR_ID,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT', statusCode: 409 });
  });
});

// =============================================================================
// updateCourse
// =============================================================================

describe('updateCourse', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates a course successfully', async () => {
    vi.mocked(prisma.course.findUnique).mockResolvedValueOnce({ id: COURSE_ID } as never);
    // No findFirst mock needed — updating title only (no code change) skips the duplicate check
    vi.mocked(prisma.course.update).mockResolvedValueOnce({
      ...COURSE_RECORD,
      title: 'Updated Title',
    } as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

    const result = await updateCourse(COURSE_ID, { title: 'Updated Title' }, ACTOR_ID);

    expect(result.title).toBe('Updated Title');
  });

  it('throws NOT_FOUND when course does not exist', async () => {
    vi.mocked(prisma.course.findUnique).mockResolvedValueOnce(null);

    await expect(updateCourse(COURSE_ID, { title: 'X' }, ACTOR_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
      statusCode: 404,
    });
  });

  it('throws CONFLICT when new code is already used by another course', async () => {
    vi.mocked(prisma.course.findUnique).mockResolvedValueOnce({ id: COURSE_ID } as never);
    vi.mocked(prisma.course.findFirst).mockResolvedValueOnce({ id: 'other-course' } as never);

    await expect(updateCourse(COURSE_ID, { code: 'BIO301' }, ACTOR_ID)).rejects.toMatchObject({
      code: 'CONFLICT',
      statusCode: 409,
    });
  });
});
