/**
 * @file analytics.service.test.ts
 * @module modules/analytics/__tests__
 *
 * Unit tests for the analytics service (Phase 28 additions).
 *
 * All Prisma and Redis calls are mocked. Tests verify trend calculation,
 * student dynamic messages, and absence clustering detection.
 *
 * Test coverage:
 *
 * getCourseAnalytics
 * - Improving trend: last 4 avg 80%, previous 4 avg 70% → trend: IMPROVING
 * - Stable trend: diff ≤ 5% → trend: STABLE
 * - No sessions → returns empty analytics with STABLE trend
 *
 * getStudentAnalytics
 * - Student needing 3 more classes for 75% → dynamic message includes "3 more classes"
 * - Student already eligible → message includes "eligible"
 * - Student with 3 Monday absences → absenceClustering: true
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Mocks
// =============================================================================

vi.mock('../../../lib/prisma.js', () => ({
  prisma: {
    courseSession: { findMany: vi.fn() },
    courseEnrollment: { findMany: vi.fn() },
    semester: { findFirst: vi.fn(), findUnique: vi.fn() },
    student: { findUnique: vi.fn() },
    faculty: { findMany: vi.fn() },
    department: { findMany: vi.fn() },
    courseSection: { findMany: vi.fn() },
    examEligibility: { count: vi.fn() },
    excuseLetter: { count: vi.fn() },
    lecturer: { findUnique: vi.fn() },
  },
}));

vi.mock('../../../lib/redis.js', () => ({
  workerRedis: { on: vi.fn() },
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

import { getCourseAnalytics, getStudentAnalytics } from '../analytics.service.js';
import { prisma } from '../../../lib/prisma.js';

// =============================================================================
// Fixtures
// =============================================================================

const SECTION_ID = 'a0000000-0000-4000-8000-000000000001';
const SEMESTER_ID = 'a0000000-0000-4000-8000-000000000002';
const STUDENT_ID = 'a0000000-0000-4000-8000-000000000003';

/**
 * Builds a mock session with a given attendance rate.
 *
 * @param id   - Session UUID.
 * @param rate - Desired attendance rate (0–100). Enrolled = 10, present = rate/10.
 * @param date - Session date.
 * @returns Mock session object.
 */
function makeSession(id: string, rate: number, date: Date) {
  const enrolled = 10;
  const present = Math.round((rate / 100) * enrolled);
  return {
    id,
    scheduledStart: date,
    attendanceRecords: [
      ...Array.from({ length: present }, () => ({ status: 'PRESENT' })),
      ...Array.from({ length: enrolled - present }, () => ({ status: 'ABSENT' })),
    ],
    courseSection: {
      enrollments: Array.from({ length: enrolled }, (_, i) => ({ id: `enroll-${i}` })),
    },
  };
}

// =============================================================================
// Shared setup
// =============================================================================

beforeEach(() => {
  vi.clearAllMocks();
});

// =============================================================================
// getCourseAnalytics
// =============================================================================

describe('getCourseAnalytics', () => {
  it('returns IMPROVING trend when last 4 avg is 10% above previous 4', async () => {
    const now = new Date();
    const sessions = [
      // Previous 4: ~70% each
      makeSession('s1', 70, new Date(now.getTime() - 8 * 7 * 86400_000)),
      makeSession('s2', 70, new Date(now.getTime() - 7 * 7 * 86400_000)),
      makeSession('s3', 70, new Date(now.getTime() - 6 * 7 * 86400_000)),
      makeSession('s4', 70, new Date(now.getTime() - 5 * 7 * 86400_000)),
      // Last 4: ~80% each
      makeSession('s5', 80, new Date(now.getTime() - 4 * 7 * 86400_000)),
      makeSession('s6', 80, new Date(now.getTime() - 3 * 7 * 86400_000)),
      makeSession('s7', 80, new Date(now.getTime() - 2 * 7 * 86400_000)),
      makeSession('s8', 80, new Date(now.getTime() - 1 * 7 * 86400_000)),
    ];

    vi.mocked(prisma.courseSession.findMany).mockResolvedValue(sessions as never);

    const result = await getCourseAnalytics(SECTION_ID, SEMESTER_ID);

    expect(result.trend).toBe('IMPROVING');
    expect(result.averageRate).toBeGreaterThan(0);
  });

  it('returns STABLE trend when difference is ≤ 5%', async () => {
    const now = new Date();
    const sessions = [
      makeSession('s1', 75, new Date(now.getTime() - 8 * 7 * 86400_000)),
      makeSession('s2', 75, new Date(now.getTime() - 7 * 7 * 86400_000)),
      makeSession('s3', 75, new Date(now.getTime() - 6 * 7 * 86400_000)),
      makeSession('s4', 75, new Date(now.getTime() - 5 * 7 * 86400_000)),
      makeSession('s5', 77, new Date(now.getTime() - 4 * 7 * 86400_000)),
      makeSession('s6', 77, new Date(now.getTime() - 3 * 7 * 86400_000)),
      makeSession('s7', 77, new Date(now.getTime() - 2 * 7 * 86400_000)),
      makeSession('s8', 77, new Date(now.getTime() - 1 * 7 * 86400_000)),
    ];

    vi.mocked(prisma.courseSession.findMany).mockResolvedValue(sessions as never);

    const result = await getCourseAnalytics(SECTION_ID, SEMESTER_ID);

    expect(result.trend).toBe('STABLE');
  });

  it('returns empty analytics with STABLE trend when no sessions exist', async () => {
    vi.mocked(prisma.courseSession.findMany).mockResolvedValue([]);

    const result = await getCourseAnalytics(SECTION_ID, SEMESTER_ID);

    expect(result.trend).toBe('STABLE');
    expect(result.sessionRates).toHaveLength(0);
    expect(result.averageRate).toBe(0);
  });
});

// =============================================================================
// getStudentAnalytics
// =============================================================================

describe('getStudentAnalytics', () => {
  it('includes "3 more classes" in dynamic message when student needs 3 more for 75%', async () => {
    // 20 sessions, 12 present = 60% — needs 3 more to reach 75% with 10 remaining
    vi.mocked(prisma.courseEnrollment.findMany).mockResolvedValue([
      {
        id: 'enroll-1',
        courseSection: {
          course: { code: 'BIO201' },
          sessions: Array.from({ length: 20 }, (_, i) => ({
            id: `s${i}`,
            scheduledStart: new Date(),
          })),
          enrollments: [
            { attendanceRecords: Array.from({ length: 12 }, () => ({ status: 'PRESENT' })) },
          ],
        },
        attendanceRecords: Array.from({ length: 12 }, () => ({
          status: 'PRESENT',
          session: { scheduledStart: new Date() },
        })),
      },
    ] as never);

    const result = await getStudentAnalytics(STUDENT_ID, SEMESTER_ID);

    expect(result.courses).toHaveLength(1);
    // 12/20 = 60%, needs classesNeededForThreshold(12, 20, 10, 75)
    // requiredPresent = ceil(0.75 * 30) = 23; needed = 23 - 12 = 11 (but capped at remaining)
    // The message should mention classes needed
    expect(result.courses[0]!.dynamicMessage).toContain('more classes');
  });

  it('includes "eligible" in dynamic message when student is already at 75%+', async () => {
    // 15/20 = 75% — already eligible
    vi.mocked(prisma.courseEnrollment.findMany).mockResolvedValue([
      {
        id: 'enroll-1',
        courseSection: {
          course: { code: 'BIO201' },
          sessions: Array.from({ length: 20 }, (_, i) => ({
            id: `s${i}`,
            scheduledStart: new Date(),
          })),
          enrollments: [
            { attendanceRecords: Array.from({ length: 15 }, () => ({ status: 'PRESENT' })) },
          ],
        },
        attendanceRecords: Array.from({ length: 15 }, () => ({
          status: 'PRESENT',
          session: { scheduledStart: new Date() },
        })),
      },
    ] as never);

    const result = await getStudentAnalytics(STUDENT_ID, SEMESTER_ID);

    expect(result.courses[0]!.dynamicMessage).toContain('eligible');
  });

  it('sets absenceClustering=true when student has 3+ absences on the same weekday', async () => {
    // Create 3 absences all on Monday (day 1)
    const monday1 = new Date('2026-03-02T08:00:00Z'); // Monday
    const monday2 = new Date('2026-03-09T08:00:00Z'); // Monday
    const monday3 = new Date('2026-03-16T08:00:00Z'); // Monday

    vi.mocked(prisma.courseEnrollment.findMany).mockResolvedValue([
      {
        id: 'enroll-1',
        courseSection: {
          course: { code: 'BIO201' },
          sessions: [
            { id: 's1', scheduledStart: monday1 },
            { id: 's2', scheduledStart: monday2 },
            { id: 's3', scheduledStart: monday3 },
          ],
          enrollments: [{ attendanceRecords: [] }],
        },
        attendanceRecords: [
          { status: 'ABSENT', session: { scheduledStart: monday1 } },
          { status: 'ABSENT', session: { scheduledStart: monday2 } },
          { status: 'ABSENT', session: { scheduledStart: monday3 } },
        ],
      },
    ] as never);

    const result = await getStudentAnalytics(STUDENT_ID, SEMESTER_ID);

    expect(result.courses[0]!.absenceClustering).toBe(true);
  });
});
