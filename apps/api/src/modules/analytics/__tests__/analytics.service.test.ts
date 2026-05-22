/**
 * @file analytics.service.test.ts
 * @module modules/analytics/__tests__
 *
 * Unit tests for the analytics dashboard service.
 *
 * All Prisma and Redis calls are mocked. Tests verify role-specific data
 * shapes, Redis caching behaviour, and the no-active-semester edge case.
 *
 * Test coverage:
 *
 * getDashboardData for STUDENT
 * - Returns health cards for enrolled courses
 * - Returns pendingExcuseCount
 *
 * getDashboardData for LECTURER
 * - Returns per-course trends
 * - Returns activeSession when one exists
 *
 * getDashboardData for HOD
 * - Returns department-scoped course data
 *
 * Caching
 * - Stores result in Redis on first call
 * - Returns cached result on second call (no DB query)
 *
 * No active semester
 * - Returns { role, message: 'No active semester' }
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Mocks
// =============================================================================

vi.mock('../../../lib/prisma.js', () => ({
  prisma: {
    semester: { findFirst: vi.fn() },
    student: { findUnique: vi.fn() },
    lecturer: { findUnique: vi.fn() },
    courseEnrollment: { findMany: vi.fn() },
    courseSection: { findMany: vi.fn() },
    courseSession: { findFirst: vi.fn(), count: vi.fn() },
    examEligibility: { count: vi.fn() },
    excuseLetter: { count: vi.fn() },
    faculty: { findMany: vi.fn() },
    department: { findMany: vi.fn() },
  },
}));

vi.mock('../../../lib/redis.js', () => ({
  redis: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    ping: vi.fn().mockResolvedValue('PONG'),
  },
  connectRedis: vi.fn(),
}));

// =============================================================================
// Imports (after mocks)
// =============================================================================

import { getDashboardData } from '../analytics.service.js';
import { prisma } from '../../../lib/prisma.js';
import { redis } from '../../../lib/redis.js';
import { Role } from '@kwasu-ams/types';

// =============================================================================
// Fixtures
// =============================================================================

const USER_ID = 'a0000000-0000-4000-8000-000000000001';
const STUDENT_ID = 'a0000000-0000-4000-8000-000000000002';
const LECTURER_ID = 'a0000000-0000-4000-8000-000000000003';
const SEMESTER_ID = 'a0000000-0000-4000-8000-000000000004';
const SECTION_ID = 'a0000000-0000-4000-8000-000000000005';

const makeSemester = () => ({ id: SEMESTER_ID, eligibilityThreshold: 75.0 });

// =============================================================================
// Shared setup
// =============================================================================

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(redis.get).mockResolvedValue(null); // cache miss by default
});

// =============================================================================
// No active semester
// =============================================================================

describe('getDashboardData — no active semester', () => {
  it('returns message when no active semester exists', async () => {
    vi.mocked(prisma.semester.findFirst).mockResolvedValue(null);

    const result = await getDashboardData(USER_ID, Role.STUDENT, null);

    expect(result).toMatchObject({ role: Role.STUDENT, message: 'No active semester' });
  });
});

// =============================================================================
// STUDENT dashboard
// =============================================================================

describe('getDashboardData for STUDENT', () => {
  it('returns health cards for enrolled courses', async () => {
    vi.mocked(prisma.semester.findFirst).mockResolvedValue(makeSemester() as never);
    vi.mocked(prisma.student.findUnique).mockResolvedValue({ id: STUDENT_ID } as never);
    vi.mocked(prisma.courseEnrollment.findMany).mockResolvedValue([
      {
        id: 'enroll-1',
        courseSection: {
          course: { code: 'BIO201', title: 'General Biology II' },
          sessions: [{ id: 'sess-1' }, { id: 'sess-2' }, { id: 'sess-3' }, { id: 'sess-4' }],
        },
        attendanceRecords: [
          { status: 'PRESENT' },
          { status: 'PRESENT' },
          { status: 'PRESENT' },
          { status: 'ABSENT' },
        ],
        examEligibilities: [{ status: 'ELIGIBLE' }],
      },
    ] as never);
    vi.mocked(prisma.excuseLetter.count).mockResolvedValue(2);

    const result = await getDashboardData(USER_ID, Role.STUDENT, null);

    expect(result).toMatchObject({ role: 'STUDENT' });
    const data = result as {
      role: string;
      healthCards: Array<{ courseCode: string; percentage: number }>;
      pendingExcuseCount: number;
    };
    expect(data.healthCards).toHaveLength(1);
    expect(data.healthCards[0]!.courseCode).toBe('BIO201');
    expect(data.healthCards[0]!.percentage).toBe(75.0); // 3/4 = 75%
    expect(data.pendingExcuseCount).toBe(2);
  });
});

// =============================================================================
// LECTURER dashboard
// =============================================================================

describe('getDashboardData for LECTURER', () => {
  it('returns per-course trends and active session', async () => {
    vi.mocked(prisma.semester.findFirst).mockResolvedValue(makeSemester() as never);
    vi.mocked(prisma.lecturer.findUnique).mockResolvedValue({ id: LECTURER_ID } as never);
    vi.mocked(prisma.courseSection.findMany).mockResolvedValue([
      {
        sectionLabel: 'A',
        course: { code: 'BIO201' },
        sessions: [
          {
            id: 'sess-1',
            scheduledStart: new Date(),
            attendanceRecords: [{ status: 'PRESENT' }, { status: 'ABSENT' }],
          },
          {
            id: 'sess-2',
            scheduledStart: new Date(),
            attendanceRecords: [{ status: 'PRESENT' }, { status: 'PRESENT' }],
          },
        ],
        enrollments: [
          { attendanceRecords: [{ status: 'PRESENT' }, { status: 'PRESENT' }] },
          { attendanceRecords: [{ status: 'ABSENT' }, { status: 'ABSENT' }] },
        ],
      },
    ] as never);
    vi.mocked(prisma.courseSession.findFirst).mockResolvedValue({
      id: 'active-sess',
      courseSection: { course: { code: 'BIO201' } },
    } as never);

    const result = await getDashboardData(USER_ID, Role.LECTURER, null);

    expect(result).toMatchObject({ role: 'LECTURER' });
    const data = result as {
      role: string;
      trends: Array<{ courseCode: string; recentRates: number[] }>;
      activeSession: { sessionId: string } | null;
    };
    expect(data.trends).toHaveLength(1);
    expect(data.trends[0]!.courseCode).toBe('BIO201');
    expect(data.activeSession).not.toBeNull();
    expect(data.activeSession!.sessionId).toBe('active-sess');
  });
});

// =============================================================================
// HOD dashboard
// =============================================================================

describe('getDashboardData for HOD', () => {
  it('returns department-scoped course data', async () => {
    vi.mocked(prisma.semester.findFirst).mockResolvedValue(makeSemester() as never);
    vi.mocked(prisma.courseSection.findMany).mockResolvedValue([
      {
        course: { code: 'BIO201' },
        sessions: [
          {
            attendanceRecords: [
              { status: 'PRESENT' },
              { status: 'PRESENT' },
              { status: 'ABSENT' },
              { status: 'ABSENT' },
            ],
          },
        ],
        enrollments: [
          {
            student: { matricNumber: '22D/001/2024', user: { fullName: 'Test Student' } },
            attendanceRecords: [{ status: 'PRESENT' }, { status: 'ABSENT' }],
          },
        ],
      },
    ] as never);

    const result = await getDashboardData(USER_ID, Role.HOD, 'dept-id');

    expect(result).toMatchObject({ role: 'HOD' });
    const data = result as { role: string; courses: Array<{ courseCode: string; rate: number }> };
    expect(data.courses).toHaveLength(1);
    expect(data.courses[0]!.courseCode).toBe('BIO201');
    expect(data.courses[0]!.rate).toBe(50.0); // 2/4 = 50%
  });
});

// =============================================================================
// Caching
// =============================================================================

describe('getDashboardData — caching', () => {
  it('stores result in Redis on first call (cache miss)', async () => {
    vi.mocked(prisma.semester.findFirst).mockResolvedValue(makeSemester() as never);
    vi.mocked(prisma.student.findUnique).mockResolvedValue({ id: STUDENT_ID } as never);
    vi.mocked(prisma.courseEnrollment.findMany).mockResolvedValue([]);
    vi.mocked(prisma.excuseLetter.count).mockResolvedValue(0);

    await getDashboardData(USER_ID, Role.STUDENT, null);

    expect(redis.set).toHaveBeenCalledOnce();
    const [key, , , ttl] = vi.mocked(redis.set).mock.calls[0]!;
    expect(key).toContain('dashboard:student:');
    expect(ttl).toBe(60);
  });

  it('returns cached result on second call without hitting the database', async () => {
    const cachedData = JSON.stringify({ role: 'STUDENT', healthCards: [], pendingExcuseCount: 0 });
    vi.mocked(redis.get).mockResolvedValue(cachedData);
    vi.mocked(prisma.semester.findFirst).mockResolvedValue(makeSemester() as never);

    const result = await getDashboardData(USER_ID, Role.STUDENT, null);

    expect(result).toMatchObject({ role: 'STUDENT', healthCards: [] });
    // Database should NOT be queried for student/enrollment data
    expect(prisma.student.findUnique).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });
});
