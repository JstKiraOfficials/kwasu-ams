/**
 * @file smart-conflict-detector.test.ts
 * @module modules/timetable/__tests__
 *
 * Unit tests for the smart timetable conflict detector service.
 *
 * All Prisma and notification queue calls are mocked.
 *
 * Test coverage:
 *
 * detectTimetableConflicts
 * - Student absent Mon 08:00 in 3 courses for 3 consecutive weeks → REPEATED_DAY_PATTERN flag
 * - Student absent Mon 08:00 in 3 courses for only 2 consecutive weeks → no flag
 * - Student absent Mon 08:00 in only 2 courses for 3 consecutive weeks → no flag
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../../lib/prisma.js', () => ({
  prisma: {
    courseEnrollment: { groupBy: vi.fn() },
    attendanceRecord: { findMany: vi.fn() },
    anomalyFlag: { upsert: vi.fn() },
    user: { findMany: vi.fn() },
  },
}));

vi.mock('../../../lib/redis.js', () => ({
  redis: { on: vi.fn() },
  connectRedis: vi.fn(),
}));

vi.mock('bullmq', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Queue: vi.fn().mockImplementation(function (this: any) {
    this.add = vi.fn().mockResolvedValue({ id: 'job-1' });
    this.on = vi.fn();
  }),
}));

vi.mock('../../../jobs/queue.js', () => ({
  notificationQueue: { add: vi.fn().mockResolvedValue({ id: 'notif-1' }) },
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { detectTimetableConflicts } from '../smart-conflict-detector.service.js';
import { prisma } from '../../../lib/prisma.js';
import { notificationQueue } from '../../../jobs/queue.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SEMESTER_ID = 'a0000000-0000-4000-8000-000000000001';
const STUDENT_ID = 'a0000000-0000-4000-8000-000000000002';
const SECTION_A = 'a0000000-0000-4000-8000-000000000010';
const SECTION_B = 'a0000000-0000-4000-8000-000000000011';
const SECTION_C = 'a0000000-0000-4000-8000-000000000012';
const AA_USER_ID = 'a0000000-0000-4000-8000-000000000020';

/**
 * Builds a mock ABSENT attendance record for a given week offset and section.
 *
 * Monday of ISO week 10 is used as the base date (2026-03-02).
 * Each `weekOffset` advances 7 days.
 *
 * @param weekOffset      - Number of weeks to add to the base date.
 * @param courseSectionId - UUID of the course section.
 * @returns Mock attendance record object.
 */
function makeAbsence(weekOffset: number, courseSectionId: string) {
  // Base: 2026-03-02 (Monday, ISO week 10)
  const date = new Date('2026-03-02T08:00:00.000Z');
  date.setDate(date.getDate() + weekOffset * 7);
  return {
    session: {
      scheduledStart: date,
      courseSectionId,
      timetableEntry: { dayOfWeek: 'MONDAY', startTime: '08:00' },
    },
  };
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.anomalyFlag.upsert).mockResolvedValue({} as never);
  vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: AA_USER_ID }] as never);
  vi.mocked(prisma.courseEnrollment.groupBy).mockResolvedValue([
    { studentId: STUDENT_ID },
  ] as never);
});

// =============================================================================
// 3 courses, 3 consecutive weeks → flag created
// =============================================================================

describe('detectTimetableConflicts — 3 courses, 3 consecutive weeks', () => {
  it('creates REPEATED_DAY_PATTERN flag and notifies ACADEMIC_AFFAIRS', async () => {
    // Weeks 10, 11, 12 (consecutive) across 3 different sections
    vi.mocked(prisma.attendanceRecord.findMany).mockResolvedValue([
      makeAbsence(0, SECTION_A), // week 10
      makeAbsence(1, SECTION_B), // week 11
      makeAbsence(2, SECTION_C), // week 12
    ] as never);

    await detectTimetableConflicts(SEMESTER_ID);

    expect(prisma.anomalyFlag.upsert).toHaveBeenCalledOnce();
    expect(prisma.anomalyFlag.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          flagType: 'REPEATED_DAY_PATTERN',
          studentId: STUDENT_ID,
        }),
      }),
    );
    expect(notificationQueue.add).toHaveBeenCalledWith(
      'dispatch',
      expect.objectContaining({ recipientId: AA_USER_ID, trigger: 'ANOMALY_FLAGGED' }),
    );
  });
});

// =============================================================================
// 3 courses, only 2 consecutive weeks → no flag
// =============================================================================

describe('detectTimetableConflicts — 3 courses, only 2 consecutive weeks', () => {
  it('does not create a flag when consecutive run is only 2 weeks', async () => {
    // Weeks 10, 11 (2 consecutive) then 13 (gap) — no run of 3
    vi.mocked(prisma.attendanceRecord.findMany).mockResolvedValue([
      makeAbsence(0, SECTION_A), // week 10
      makeAbsence(1, SECTION_B), // week 11
      makeAbsence(3, SECTION_C), // week 13 (gap after week 11)
    ] as never);

    await detectTimetableConflicts(SEMESTER_ID);

    expect(prisma.anomalyFlag.upsert).not.toHaveBeenCalled();
    expect(notificationQueue.add).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Only 2 courses, 3 consecutive weeks → no flag
// =============================================================================

describe('detectTimetableConflicts — 2 courses only, 3 consecutive weeks', () => {
  it('does not create a flag when fewer than 3 distinct courses are affected', async () => {
    // Weeks 10, 11, 12 but only 2 sections (A and B repeated)
    vi.mocked(prisma.attendanceRecord.findMany).mockResolvedValue([
      makeAbsence(0, SECTION_A), // week 10, section A
      makeAbsence(1, SECTION_B), // week 11, section B
      makeAbsence(2, SECTION_A), // week 12, section A again
    ] as never);

    await detectTimetableConflicts(SEMESTER_ID);

    expect(prisma.anomalyFlag.upsert).not.toHaveBeenCalled();
    expect(notificationQueue.add).not.toHaveBeenCalled();
  });
});
