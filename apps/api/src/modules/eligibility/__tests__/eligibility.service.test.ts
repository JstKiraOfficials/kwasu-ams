/**
 * @file eligibility.service.test.ts
 * @module modules/eligibility/__tests__
 *
 * Unit tests for the eligibility computation and override service.
 *
 * All Prisma calls are mocked. Tests verify the exact percentage calculations
 * and status assignments for all threshold boundary cases.
 *
 * Test coverage:
 *
 * computeEligibilityForEnrollment
 * - 15/20 present → rawPercentage: 75.0, status: ELIGIBLE
 * - 14/20 present → rawPercentage: 70.0, status: BARRED
 * - 14/20 present + 1 EXCUSED → effectivePercentage: 75.0, status: ELIGIBLE
 * - 13/20 present + approved MEDICAL excuse → effectivePercentage: 70.0, status: CONDITIONAL
 * - 12/20 present (60%) → status: BARRED (below 70%, not CONDITIONAL)
 * - 0 sessions → status: PENDING
 *
 * overrideEligibilityStatus
 * - Frozen semester + LECTURER role → throws ELIGIBILITY_FROZEN
 * - Frozen semester + DEAN role → succeeds
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Mocks
// =============================================================================

vi.mock('../../../lib/prisma.js', () => ({
  prisma: {
    courseEnrollment: { findUnique: vi.fn(), findMany: vi.fn() },
    courseSession: { findMany: vi.fn() },
    attendanceRecord: { findMany: vi.fn() },
    excuseLetter: { findFirst: vi.fn() },
    examEligibility: { findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn() },
    semester: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));

// =============================================================================
// Imports (after mocks)
// =============================================================================

import {
  computeEligibilityForEnrollment,
  overrideEligibilityStatus,
} from '../eligibility.service.js';
import { prisma } from '../../../lib/prisma.js';
import { EligibilityStatus, Role } from '@kwasu-ams/types';

// =============================================================================
// Fixtures
// =============================================================================

const ENROLLMENT_ID = 'a0000000-0000-4000-8000-000000000001';
const SEMESTER_ID = 'a0000000-0000-4000-8000-000000000002';
const STUDENT_ID = 'a0000000-0000-4000-8000-000000000003';
const SECTION_ID = 'a0000000-0000-4000-8000-000000000004';
const ELIGIBILITY_ID = 'a0000000-0000-4000-8000-000000000005';
const ACTOR_ID = 'a0000000-0000-4000-8000-000000000006';

const makeEnrollment = () => ({
  id: ENROLLMENT_ID,
  studentId: STUDENT_ID,
  courseSectionId: SECTION_ID,
});

const makeSemester = (threshold = 75.0, isFrozen = false) => ({
  id: SEMESTER_ID,
  eligibilityThreshold: threshold,
  isFrozen,
  endDate: new Date('2026-06-30'),
  appealWindowDays: 5,
});

/**
 * Builds a list of mock session IDs.
 *
 * @param count - Number of sessions to create.
 * @returns Array of session objects with UUID-like IDs.
 */
function makeSessions(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `a0000000-0000-4000-8000-0000000000${String(i).padStart(2, '0')}`,
  }));
}

/**
 * Builds attendance records with a given number of PRESENT and EXCUSED records.
 *
 * @param presentCount - Number of PRESENT records.
 * @param excusedCount - Number of EXCUSED records.
 * @returns Array of mock attendance record objects.
 */
function makeAttendanceRecords(presentCount: number, excusedCount: number) {
  return [
    ...Array.from({ length: presentCount }, () => ({ status: 'PRESENT' })),
    ...Array.from({ length: excusedCount }, () => ({ status: 'EXCUSED' })),
  ];
}

// =============================================================================
// Shared setup
// =============================================================================

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);
  vi.mocked(prisma.excuseLetter.findFirst).mockResolvedValue(null); // no medical excuse by default
});

// =============================================================================
// computeEligibilityForEnrollment
// =============================================================================

describe('computeEligibilityForEnrollment', () => {
  it('returns PENDING when there are 0 sessions', async () => {
    vi.mocked(prisma.courseEnrollment.findUnique).mockResolvedValue(makeEnrollment() as never);
    vi.mocked(prisma.semester.findUnique).mockResolvedValue(makeSemester() as never);
    vi.mocked(prisma.courseSession.findMany).mockResolvedValue([]);

    const result = await computeEligibilityForEnrollment(ENROLLMENT_ID, SEMESTER_ID);

    expect(result.status).toBe(EligibilityStatus.PENDING);
    expect(result.totalSessions).toBe(0);
    expect(result.rawPercentage).toBe(0);
  });

  it('returns ELIGIBLE with rawPercentage 75.0 for 15/20 present', async () => {
    vi.mocked(prisma.courseEnrollment.findUnique).mockResolvedValue(makeEnrollment() as never);
    vi.mocked(prisma.semester.findUnique).mockResolvedValue(makeSemester() as never);
    vi.mocked(prisma.courseSession.findMany).mockResolvedValue(makeSessions(20) as never);
    vi.mocked(prisma.attendanceRecord.findMany).mockResolvedValue(
      makeAttendanceRecords(15, 0) as never,
    );

    const result = await computeEligibilityForEnrollment(ENROLLMENT_ID, SEMESTER_ID);

    expect(result.rawPercentage).toBe(75.0);
    expect(result.effectivePercentage).toBe(75.0);
    expect(result.status).toBe(EligibilityStatus.ELIGIBLE);
    expect(result.presentCount).toBe(15);
    expect(result.totalSessions).toBe(20);
  });

  it('returns BARRED with rawPercentage 70.0 for 14/20 present (below 75%)', async () => {
    vi.mocked(prisma.courseEnrollment.findUnique).mockResolvedValue(makeEnrollment() as never);
    vi.mocked(prisma.semester.findUnique).mockResolvedValue(makeSemester() as never);
    vi.mocked(prisma.courseSession.findMany).mockResolvedValue(makeSessions(20) as never);
    vi.mocked(prisma.attendanceRecord.findMany).mockResolvedValue(
      makeAttendanceRecords(14, 0) as never,
    );

    const result = await computeEligibilityForEnrollment(ENROLLMENT_ID, SEMESTER_ID);

    expect(result.rawPercentage).toBe(70.0);
    expect(result.status).toBe(EligibilityStatus.BARRED);
  });

  it('returns ELIGIBLE with effectivePercentage 75.0 for 14/20 present + 1 EXCUSED', async () => {
    vi.mocked(prisma.courseEnrollment.findUnique).mockResolvedValue(makeEnrollment() as never);
    vi.mocked(prisma.semester.findUnique).mockResolvedValue(makeSemester() as never);
    vi.mocked(prisma.courseSession.findMany).mockResolvedValue(makeSessions(20) as never);
    vi.mocked(prisma.attendanceRecord.findMany).mockResolvedValue(
      makeAttendanceRecords(14, 1) as never,
    );

    const result = await computeEligibilityForEnrollment(ENROLLMENT_ID, SEMESTER_ID);

    expect(result.rawPercentage).toBe(70.0);
    expect(result.effectivePercentage).toBe(75.0);
    expect(result.status).toBe(EligibilityStatus.ELIGIBLE);
  });

  it('returns CONDITIONAL for 13/20 present + approved MEDICAL excuse (effectivePercentage 70%)', async () => {
    vi.mocked(prisma.courseEnrollment.findUnique).mockResolvedValue(makeEnrollment() as never);
    vi.mocked(prisma.semester.findUnique).mockResolvedValue(makeSemester() as never);
    vi.mocked(prisma.courseSession.findMany).mockResolvedValue(makeSessions(20) as never);
    vi.mocked(prisma.attendanceRecord.findMany).mockResolvedValue(
      makeAttendanceRecords(13, 1) as never, // 14/20 = 70% effective
    );
    // Medical excuse exists
    vi.mocked(prisma.excuseLetter.findFirst).mockResolvedValue({ id: 'excuse-1' } as never);

    const result = await computeEligibilityForEnrollment(ENROLLMENT_ID, SEMESTER_ID);

    expect(result.effectivePercentage).toBe(70.0);
    expect(result.status).toBe(EligibilityStatus.CONDITIONAL);
  });

  it('returns BARRED for 12/20 present (60%) — below 70%, not CONDITIONAL', async () => {
    vi.mocked(prisma.courseEnrollment.findUnique).mockResolvedValue(makeEnrollment() as never);
    vi.mocked(prisma.semester.findUnique).mockResolvedValue(makeSemester() as never);
    vi.mocked(prisma.courseSession.findMany).mockResolvedValue(makeSessions(20) as never);
    vi.mocked(prisma.attendanceRecord.findMany).mockResolvedValue(
      makeAttendanceRecords(12, 0) as never,
    );

    const result = await computeEligibilityForEnrollment(ENROLLMENT_ID, SEMESTER_ID);

    expect(result.effectivePercentage).toBe(60.0);
    expect(result.status).toBe(EligibilityStatus.BARRED);
  });
});

// =============================================================================
// overrideEligibilityStatus
// =============================================================================

describe('overrideEligibilityStatus', () => {
  const makeEligibility = (isFrozen = false) => ({
    id: ELIGIBILITY_ID,
    status: 'BARRED',
    semester: { id: SEMESTER_ID, isFrozen },
  });

  it('throws ELIGIBILITY_FROZEN when semester is frozen and actor is LECTURER', async () => {
    vi.mocked(prisma.examEligibility.findUnique).mockResolvedValue(makeEligibility(true) as never);

    await expect(
      overrideEligibilityStatus(
        ELIGIBILITY_ID,
        { status: EligibilityStatus.ELIGIBLE, reason: 'Correcting an error in records.' },
        ACTOR_ID,
        Role.LECTURER,
      ),
    ).rejects.toMatchObject({ code: 'ELIGIBILITY_FROZEN', statusCode: 403 });
  });

  it('succeeds when semester is frozen and actor is DEAN', async () => {
    vi.mocked(prisma.examEligibility.findUnique).mockResolvedValue(makeEligibility(true) as never);
    vi.mocked(prisma.examEligibility.update).mockResolvedValue({
      ...makeEligibility(true),
      status: 'ELIGIBLE',
    } as never);

    const result = await overrideEligibilityStatus(
      ELIGIBILITY_ID,
      { status: EligibilityStatus.ELIGIBLE, reason: 'Correcting an error in records.' },
      ACTOR_ID,
      Role.DEAN,
    );

    expect(result.status).toBe(EligibilityStatus.ELIGIBLE);
  });

  it('succeeds when semester is not frozen for any allowed role', async () => {
    vi.mocked(prisma.examEligibility.findUnique).mockResolvedValue(makeEligibility(false) as never);
    vi.mocked(prisma.examEligibility.update).mockResolvedValue({
      ...makeEligibility(false),
      status: 'ELIGIBLE',
    } as never);

    const result = await overrideEligibilityStatus(
      ELIGIBILITY_ID,
      { status: EligibilityStatus.ELIGIBLE, reason: 'Correcting an error in records.' },
      ACTOR_ID,
      Role.LECTURER,
    );

    expect(result.status).toBe(EligibilityStatus.ELIGIBLE);
  });
});
