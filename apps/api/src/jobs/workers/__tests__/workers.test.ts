/**
 * @file workers.test.ts
 * @module jobs/workers/__tests__
 *
 * Unit tests for the BullMQ workers.
 *
 * All Prisma, Redis, and notification queue calls are mocked.
 *
 * Test coverage:
 *
 * audit-log.worker
 * - Creates AuditLog record from job data
 *
 * welfare-check.worker
 * - Student below 70% in 3+ courses → WELFARE_REFERRAL notification enqueued
 * - Student below 70% in only 2 courses → no notification
 *
 * early-intervention.worker
 * - Student projected below threshold → atRiskPredicted = true
 * - Student projected above threshold → no change
 *
 * lecturer-accountability.worker
 * - Lecturer with all sessions held → high score
 * - Lecturer with no sessions → score 0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Mocks
// =============================================================================

vi.mock('../../../lib/prisma.js', () => ({
  prisma: {
    auditLog: { create: vi.fn() },
    examEligibility: { findMany: vi.fn(), update: vi.fn(), findFirst: vi.fn() },
    user: { findFirst: vi.fn() },
    lecturer: { findMany: vi.fn(), update: vi.fn() },
    courseSection: { findMany: vi.fn() },
    courseSession: { findMany: vi.fn() },
    courseEnrollment: { findMany: vi.fn() },
    manualOverride: { count: vi.fn() },
    semester: { findUnique: vi.fn() },
    student: { findMany: vi.fn() },
    timetableEntry: { count: vi.fn() },
    department: { findUnique: vi.fn() },
  },
}));

vi.mock('../../../lib/redis.js', () => ({
  workerRedis: { on: vi.fn() },
  redis: { on: vi.fn() },
  connectRedis: vi.fn(),
}));

vi.mock('bullmq', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Worker: vi.fn().mockImplementation(function (this: any) {
    this.on = vi.fn();
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Queue: vi.fn().mockImplementation(function (this: any) {
    this.add = vi.fn().mockResolvedValue({ id: 'job-1' });
    this.on = vi.fn();
  }),
}));

vi.mock('../../queue.js', () => ({
  notificationQueue: { add: vi.fn().mockResolvedValue({ id: 'notif-1' }) },
  auditLogQueue: { add: vi.fn() },
  anomalyDetectionQueue: { add: vi.fn() },
  eligibilityComputationQueue: { add: vi.fn() },
  earlyInterventionQueue: { add: vi.fn() },
  accountabilityQueue: { add: vi.fn() },
  welfareCheckQueue: { add: vi.fn() },
  weeklySummaryQueue: { add: vi.fn() },
  semesterReportsQueue: { add: vi.fn() },
  classRegisterQueue: { addBulk: vi.fn().mockResolvedValue([]) },
  reportCardQueue: { addBulk: vi.fn().mockResolvedValue([]) },
  bulkAccountQueue: { add: vi.fn() },
  smartConflictQueue: {},
  heatmapRefreshQueue: {},
}));

// =============================================================================
// Imports (after mocks)
// =============================================================================

import { processAuditLog } from '../audit-log.worker.js';
import { processWelfareCheck } from '../welfare-check.worker.js';
import { processEarlyIntervention } from '../early-intervention.worker.js';
import { processLecturerAccountability } from '../lecturer-accountability.worker.js';
import { prisma } from '../../../lib/prisma.js';
import { notificationQueue } from '../../queue.js';
import { type Job } from 'bullmq';

// =============================================================================
// Fixtures
// =============================================================================

const SEMESTER_ID = 'a0000000-0000-4000-8000-000000000001';
const STUDENT_ID = 'a0000000-0000-4000-8000-000000000002';
const USER_ID = 'a0000000-0000-4000-8000-000000000003';
const LECTURER_ID = 'a0000000-0000-4000-8000-000000000004';
const DEPT_ID = 'a0000000-0000-4000-8000-000000000005';

/**
 * Creates a minimal mock BullMQ job object.
 *
 * @param data - Job payload data.
 * @returns Mock job object.
 */
function makeJob<T>(data: T): Job<T> {
  return { id: 'test-job', data } as unknown as Job<T>;
}

// =============================================================================
// Shared setup
// =============================================================================

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);
  vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
});

// =============================================================================
// audit-log.worker
// =============================================================================

describe('processAuditLog', () => {
  it('creates an AuditLog record from job data', async () => {
    await processAuditLog(
      makeJob({
        actorId: USER_ID,
        actorRole: 'STUDENT',
        action: 'ATTENDANCE_RECORDED',
        entityType: 'AttendanceRecord',
        entityId: 'record-1',
      }),
    );

    expect(prisma.auditLog.create).toHaveBeenCalledOnce();
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorId: USER_ID,
          entityType: 'AttendanceRecord',
        }),
      }),
    );
  });
});

// =============================================================================
// welfare-check.worker
// =============================================================================

describe('processWelfareCheck', () => {
  it('enqueues WELFARE_REFERRAL when student has 3+ at-risk courses', async () => {
    vi.mocked(prisma.examEligibility.findMany).mockResolvedValue([
      {
        studentId: STUDENT_ID,
        effectivePercentage: 60,
        student: { user: { id: USER_ID }, programme: { departmentId: DEPT_ID } },
      },
      {
        studentId: STUDENT_ID,
        effectivePercentage: 65,
        student: { user: { id: USER_ID }, programme: { departmentId: DEPT_ID } },
      },
      {
        studentId: STUDENT_ID,
        effectivePercentage: 68,
        student: { user: { id: USER_ID }, programme: { departmentId: DEPT_ID } },
      },
    ] as never);

    await processWelfareCheck(makeJob({ semesterId: SEMESTER_ID }));

    expect(notificationQueue.add).toHaveBeenCalledWith(
      'dispatch',
      expect.objectContaining({ trigger: 'WELFARE_REFERRAL', recipientId: USER_ID }),
    );
  });

  it('does not enqueue notification when student has only 2 at-risk courses', async () => {
    vi.mocked(prisma.examEligibility.findMany).mockResolvedValue([
      {
        studentId: STUDENT_ID,
        effectivePercentage: 60,
        student: { user: { id: USER_ID }, programme: { departmentId: DEPT_ID } },
      },
      {
        studentId: STUDENT_ID,
        effectivePercentage: 65,
        student: { user: { id: USER_ID }, programme: { departmentId: DEPT_ID } },
      },
      {
        studentId: STUDENT_ID,
        effectivePercentage: 80,
        student: { user: { id: USER_ID }, programme: { departmentId: DEPT_ID } },
      }, // above threshold
    ] as never);

    await processWelfareCheck(makeJob({ semesterId: SEMESTER_ID }));

    expect(notificationQueue.add).not.toHaveBeenCalled();
  });
});

// =============================================================================
// early-intervention.worker
// =============================================================================

describe('processEarlyIntervention', () => {
  beforeEach(() => {
    // Default: no timetable entries → remainingSessions will use count=0 fallback
    vi.mocked(prisma.timetableEntry.count).mockResolvedValue(0);
    vi.mocked(prisma.examEligibility.findFirst).mockResolvedValue({
      id: 'elig-1',
      effectivePercentage: 50,
    } as never);
    vi.mocked(prisma.department.findUnique).mockResolvedValue({
      id: DEPT_ID,
      name: 'Computer Science',
    } as never);
  });

  it('sets atRiskPredicted=true when projected percentage is below threshold (10/20 present, 10 remaining → 50% projected)', async () => {
    vi.mocked(prisma.semester.findUnique).mockResolvedValue({
      eligibilityThreshold: 75,
      examStartDate: new Date(Date.now() + 10 * 7 * 24 * 60 * 60 * 1000), // 10 weeks away
    } as never);

    vi.mocked(prisma.courseEnrollment.findMany).mockResolvedValue([
      {
        id: 'enroll-1',
        courseSectionId: 'cs-1',
        student: {
          id: STUDENT_ID,
          matricNumber: 'KWASU/22/0001',
          programme: { departmentId: DEPT_ID },
          user: { fullName: 'Alice' },
        },
        courseSection: {
          course: { code: 'BIO201', title: 'Biology' },
          sessions: Array.from({ length: 20 }, (_, i) => ({ id: `s${i}` })),
        },
        // 10 present out of 20; even if all 10 remaining attended: 20/30 = 66.67% < 75%
        attendanceRecords: Array.from({ length: 10 }, () => ({ status: 'PRESENT' })),
      },
    ] as never);
    vi.mocked(prisma.examEligibility.update).mockResolvedValue({} as never);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      id: USER_ID,
      fullName: 'HOD User',
    } as never);

    await processEarlyIntervention(makeJob({ semesterId: SEMESTER_ID }));

    expect(prisma.examEligibility.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { atRiskPredicted: true } }),
    );
  });

  it('sets atRiskPredicted=false when projected percentage meets threshold (14/20 present, 6 remaining → ~77%)', async () => {
    vi.mocked(prisma.semester.findUnique).mockResolvedValue({
      eligibilityThreshold: 75,
      examStartDate: new Date(Date.now() + 6 * 7 * 24 * 60 * 60 * 1000), // 6 weeks away
    } as never);

    vi.mocked(prisma.courseEnrollment.findMany).mockResolvedValue([
      {
        id: 'enroll-2',
        courseSectionId: 'cs-2',
        student: {
          id: STUDENT_ID,
          matricNumber: 'KWASU/22/0002',
          programme: { departmentId: DEPT_ID },
          user: { fullName: 'Bob' },
        },
        courseSection: {
          course: { code: 'CHE301', title: 'Chemistry' },
          sessions: Array.from({ length: 20 }, (_, i) => ({ id: `s${i}` })),
        },
        // 14 present + 6 remaining all present = 20/26 ≈ 76.9% ≥ 75%
        attendanceRecords: Array.from({ length: 14 }, () => ({ status: 'PRESENT' })),
      },
    ] as never);
    vi.mocked(prisma.examEligibility.update).mockResolvedValue({} as never);

    await processEarlyIntervention(makeJob({ semesterId: SEMESTER_ID }));

    expect(prisma.examEligibility.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { atRiskPredicted: false } }),
    );
    // No at-risk students → no notification
    expect(notificationQueue.add).not.toHaveBeenCalled();
  });

  it('running the worker twice produces no duplicate updates (idempotent upsert)', async () => {
    vi.mocked(prisma.semester.findUnique).mockResolvedValue({
      eligibilityThreshold: 75,
      examStartDate: new Date(Date.now() + 10 * 7 * 24 * 60 * 60 * 1000),
    } as never);

    vi.mocked(prisma.courseEnrollment.findMany).mockResolvedValue([
      {
        id: 'enroll-3',
        courseSectionId: 'cs-3',
        student: {
          id: STUDENT_ID,
          matricNumber: 'KWASU/22/0003',
          programme: { departmentId: DEPT_ID },
          user: { fullName: 'Carol' },
        },
        courseSection: {
          course: { code: 'PHY101', title: 'Physics' },
          sessions: Array.from({ length: 20 }, (_, i) => ({ id: `s${i}` })),
        },
        attendanceRecords: Array.from({ length: 5 }, () => ({ status: 'PRESENT' })),
      },
    ] as never);
    vi.mocked(prisma.examEligibility.update).mockResolvedValue({} as never);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      id: USER_ID,
      fullName: 'HOD User',
    } as never);

    // Run twice
    await processEarlyIntervention(makeJob({ semesterId: SEMESTER_ID }));
    await processEarlyIntervention(makeJob({ semesterId: SEMESTER_ID }));

    // update should be called once per run (2 total), no more
    expect(prisma.examEligibility.update).toHaveBeenCalledTimes(2);
    // Both calls should set atRiskPredicted: true
    for (const call of vi.mocked(prisma.examEligibility.update).mock.calls) {
      expect(call[0]).toEqual(expect.objectContaining({ data: { atRiskPredicted: true } }));
    }
  });
});

// =============================================================================
// lecturer-accountability.worker
// =============================================================================

describe('processLecturerAccountability', () => {
  it('updates accountabilityScore for each lecturer', async () => {
    vi.mocked(prisma.lecturer.findMany).mockResolvedValue([{ id: LECTURER_ID }] as never);
    vi.mocked(prisma.courseSection.findMany).mockResolvedValue([{ id: 'section-1' }] as never);
    vi.mocked(prisma.courseSession.findMany).mockResolvedValue([
      {
        status: 'CLOSED',
        scheduledStart: new Date('2026-03-01T08:00:00Z'),
        scheduledEnd: new Date('2026-03-01T10:00:00Z'),
        actualStart: new Date('2026-03-01T08:05:00Z'),
        actualEnd: new Date('2026-03-01T09:55:00Z'),
        attendanceRecords: [{ status: 'PRESENT' }, { status: 'PRESENT' }, { status: 'ABSENT' }],
        _count: { attendanceRecords: 3 },
      },
    ] as never);
    vi.mocked(prisma.manualOverride.count).mockResolvedValue(0);
    vi.mocked(prisma.lecturer.update).mockResolvedValue({} as never);

    await processLecturerAccountability(makeJob({ semesterId: SEMESTER_ID }));

    expect(prisma.lecturer.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: LECTURER_ID },
        data: expect.objectContaining({ accountabilityScore: expect.any(Number) }),
      }),
    );
  });

  it('sets score to 0 when lecturer has no course sections', async () => {
    vi.mocked(prisma.lecturer.findMany).mockResolvedValue([{ id: LECTURER_ID }] as never);
    vi.mocked(prisma.courseSection.findMany).mockResolvedValue([]);
    vi.mocked(prisma.lecturer.update).mockResolvedValue({} as never);

    await processLecturerAccountability(makeJob({ semesterId: SEMESTER_ID }));

    expect(prisma.lecturer.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { accountabilityScore: 0 } }),
    );
  });
});
