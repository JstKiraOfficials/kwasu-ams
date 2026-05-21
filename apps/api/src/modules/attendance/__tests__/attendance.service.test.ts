/**
 * @file attendance.service.test.ts
 * @module modules/attendance/__tests__
 *
 * Unit tests for the attendance list service (`listAttendance`).
 *
 * All Prisma calls are mocked — no real database connection is used.
 *
 * Test coverage:
 * - Happy path: returns paginated records for the authenticated student
 * - Filtering by `courseSectionId`
 * - Filtering by `semesterId`
 * - Filtering by `status`
 * - Correct pagination metadata (`page`, `pageSize`, `total`, `totalPages`)
 * - Empty result set returns empty `data` array with correct metadata
 * - Throws `NOT_FOUND` when no `Student` record is linked to the user ID
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Prisma } from '@prisma/client';

// =============================================================================
// Mocks — must be declared before imports that use them
// =============================================================================

vi.mock('../../../lib/prisma.js', () => ({
  prisma: {
    student: { findUnique: vi.fn() },
    attendanceRecord: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

// =============================================================================
// Imports (after mocks)
// =============================================================================

import { listAttendance } from '../attendance.service.js';
import { prisma } from '../../../lib/prisma.js';

// =============================================================================
// Fixtures
// =============================================================================

const USER_ID = 'u0000000-0000-4000-8000-000000000001';
const STUDENT_ID = 's0000000-0000-4000-8000-000000000002';
const SESSION_ID = 'se000000-0000-4000-8000-000000000003';
const SECTION_ID = 'sc000000-0000-4000-8000-000000000004';
const SEMESTER_ID = 'sm000000-0000-4000-8000-000000000005';

const makeStudent = () => ({ id: STUDENT_ID });

const makeRecord = (overrides: Record<string, unknown> = {}) => ({
  id: 'r0000000-0000-4000-8000-000000000006',
  studentId: STUDENT_ID,
  sessionId: SESSION_ID,
  status: 'PRESENT',
  checkInMethod: 'GPS_DIRECT',
  checkedInAt: new Date('2026-05-01T09:00:00Z'),
  deviceRooted: false,
  spoofingFlagged: false,
  session: {
    id: SESSION_ID,
    venue: { name: 'LT1', buildingName: 'Science Block' },
    courseSection: {
      id: SECTION_ID,
      course: { code: 'BIO201', title: 'Cell Biology' },
    },
  },
  ...overrides,
});

// =============================================================================
// Helper — extracts the first `findMany` call argument with a definite type
// =============================================================================

/**
 * Returns the first `prisma.attendanceRecord.findMany` call argument.
 * Asserts the call was made exactly once before returning.
 *
 * @returns The `findMany` options object passed in the first call.
 */
function getFirstFindManyArg(): Prisma.AttendanceRecordFindManyArgs {
  const calls = vi.mocked(prisma.attendanceRecord.findMany).mock.calls;
  expect(calls).toHaveLength(1);
  return calls[0]![0] as Prisma.AttendanceRecordFindManyArgs;
}

// =============================================================================
// Shared setup
// =============================================================================

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.student.findUnique).mockResolvedValue(makeStudent() as never);
  vi.mocked(prisma.attendanceRecord.findMany).mockResolvedValue([makeRecord()] as never);
  vi.mocked(prisma.attendanceRecord.count).mockResolvedValue(1);
});

// =============================================================================
// Happy path
// =============================================================================

describe('listAttendance — happy path', () => {
  it("returns a paginated response with the student's records", async () => {
    const result = await listAttendance(USER_ID, { page: 1, pageSize: 20 });

    expect(result.data).toHaveLength(1);
    expect(result.meta.page).toBe(1);
    expect(result.meta.pageSize).toBe(20);
    expect(result.meta.total).toBe(1);
    expect(result.meta.totalPages).toBe(1);
  });

  it('queries with studentId scoped to the resolved student', async () => {
    await listAttendance(USER_ID, { page: 1, pageSize: 20 });

    const arg = getFirstFindManyArg();
    expect(arg.where).toMatchObject({ studentId: STUDENT_ID });
  });

  it('orders results by checkedInAt descending', async () => {
    await listAttendance(USER_ID, { page: 1, pageSize: 20 });

    const arg = getFirstFindManyArg();
    expect(arg.orderBy).toEqual({ checkedInAt: 'desc' });
  });

  it('returns empty data array when no records exist', async () => {
    vi.mocked(prisma.attendanceRecord.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.attendanceRecord.count).mockResolvedValue(0);

    const result = await listAttendance(USER_ID, { page: 1, pageSize: 20 });

    expect(result.data).toHaveLength(0);
    expect(result.meta.total).toBe(0);
    expect(result.meta.totalPages).toBe(0);
  });
});

// =============================================================================
// Pagination
// =============================================================================

describe('listAttendance — pagination', () => {
  it('applies correct skip and take for page 2 with pageSize 10', async () => {
    vi.mocked(prisma.attendanceRecord.count).mockResolvedValue(25);

    await listAttendance(USER_ID, { page: 2, pageSize: 10 });

    const arg = getFirstFindManyArg();
    expect(arg.skip).toBe(10);
    expect(arg.take).toBe(10);
  });

  it('calculates totalPages correctly for 25 records with pageSize 10', async () => {
    vi.mocked(prisma.attendanceRecord.count).mockResolvedValue(25);
    vi.mocked(prisma.attendanceRecord.findMany).mockResolvedValue(
      Array.from({ length: 10 }, () => makeRecord()) as never,
    );

    const result = await listAttendance(USER_ID, { page: 1, pageSize: 10 });

    expect(result.meta.totalPages).toBe(3);
  });
});

// =============================================================================
// Filtering
// =============================================================================

describe('listAttendance — filtering', () => {
  it('adds courseSectionId filter when provided', async () => {
    await listAttendance(USER_ID, { page: 1, pageSize: 20, courseSectionId: SECTION_ID });

    const arg = getFirstFindManyArg();
    expect(arg.where).toMatchObject({
      enrollment: { courseSectionId: SECTION_ID },
    });
  });

  it('adds semesterId filter when provided', async () => {
    await listAttendance(USER_ID, { page: 1, pageSize: 20, semesterId: SEMESTER_ID });

    const arg = getFirstFindManyArg();
    expect(arg.where).toMatchObject({
      session: { courseSection: { semesterId: SEMESTER_ID } },
    });
  });

  it('adds status filter when provided', async () => {
    await listAttendance(USER_ID, { page: 1, pageSize: 20, status: 'ABSENT' as never });

    const arg = getFirstFindManyArg();
    expect(arg.where).toMatchObject({ status: 'ABSENT' });
  });

  it('does not add optional filters when they are omitted', async () => {
    await listAttendance(USER_ID, { page: 1, pageSize: 20 });

    const arg = getFirstFindManyArg();
    expect(arg.where).not.toHaveProperty('enrollment');
    expect(arg.where).not.toHaveProperty('session');
    expect(arg.where).not.toHaveProperty('status');
  });
});

// =============================================================================
// Error cases
// =============================================================================

describe('listAttendance — error cases', () => {
  it('throws NOT_FOUND when no Student record is linked to the user ID', async () => {
    vi.mocked(prisma.student.findUnique).mockResolvedValue(null);

    await expect(listAttendance(USER_ID, { page: 1, pageSize: 20 })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      statusCode: 404,
    });
  });
});
