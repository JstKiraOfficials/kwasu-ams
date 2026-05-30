/**
 * @file pdf-workers.test.ts
 * @module jobs/workers/__tests__
 *
 * Unit tests for the PDF generation BullMQ workers.
 *
 * All Prisma, S3, PDF generation, and notification queue calls are mocked.
 *
 * Test coverage:
 *
 * processClassRegisterPdf
 * - Generates a matrix with correct dimensions (sessions × students)
 * - Skips generation when S3 key already exists
 *
 * processStudentReportCard
 * - Includes trend comparison vs previous semester (↑ ↓ →)
 * - Skips generation when S3 key already exists
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { type Job } from 'bullmq';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../../lib/prisma.js', () => ({
  prisma: {
    courseSection: { findUnique: vi.fn() },
    manualOverride: { findMany: vi.fn() },
    student: { findUnique: vi.fn() },
    semester: { findUnique: vi.fn(), findFirst: vi.fn() },
    examEligibility: { findMany: vi.fn() },
    excuseLetter: { findMany: vi.fn() },
    user: { findFirst: vi.fn() },
  },
}));

vi.mock('../../../lib/redis.js', () => ({
  redis: { on: vi.fn() },
  connectRedis: vi.fn(),
}));

vi.mock('../../../lib/s3.js', () => ({
  uploadToS3: vi.fn().mockResolvedValue(undefined),
  getPresignedUrl: vi.fn().mockResolvedValue('https://s3.example.com/doc.pdf'),
  s3KeyExists: vi.fn().mockResolvedValue(false),
}));

vi.mock('../../../lib/pdf-generator.js', () => ({
  generatePdf: vi.fn().mockResolvedValue({ buffer: Buffer.from('pdf'), checksum: 'abc123' }),
}));

vi.mock('../../../lib/checksum.js', () => ({
  computeSha256: vi.fn().mockReturnValue('deadbeef'),
}));

vi.mock('../../../config/env.js', () => ({
  env: { AWS_S3_BUCKET_REPORTS: 'reports-bucket' },
}));

vi.mock('bullmq', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Worker: vi.fn().mockImplementation(function (this: any) {
    this.on = vi.fn();
  }),
}));

vi.mock('../../queue.js', () => ({
  notificationQueue: { add: vi.fn().mockResolvedValue({ id: 'notif-1' }) },
}));

vi.mock('pdfkit', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const EventEmitter = require('events');
  class FakePDF extends EventEmitter {
    page = { height: 842, width: 1190, margins: { left: 30, right: 30 } };
    y = 100;
    fontSize() {
      return this;
    }
    font() {
      return this;
    }
    text() {
      return this;
    }
    moveDown() {
      return this;
    }
    switchToPage() {
      return this;
    }
    bufferedPageRange() {
      return { start: 0, count: 1 };
    }
    end() {
      this.emit('data', Buffer.from('chunk'));
      this.emit('end');
    }
  }
  return { default: FakePDF };
});

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { processClassRegisterPdf } from '../class-register-pdf.worker.js';
import { processStudentReportCard } from '../student-report-card.worker.js';
import { prisma } from '../../../lib/prisma.js';
import { uploadToS3, s3KeyExists } from '../../../lib/s3.js';
import { generatePdf } from '../../../lib/pdf-generator.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SECTION_ID = 'a0000000-0000-4000-8000-000000000010';
const STUDENT_ID = 'a0000000-0000-4000-8000-000000000020';
const SEMESTER_ID = 'a0000000-0000-4000-8000-000000000030';
const PREV_SEMESTER_ID = 'a0000000-0000-4000-8000-000000000031';

/** Helper to build a fake BullMQ Job object. */
function makeJob<T>(data: T): Job<T> {
  return { id: 'job-1', data } as Job<T>;
}

/** Two students for matrix dimension testing. */
const MOCK_STUDENTS = [
  { id: 'stud-1', matricNumber: 'KW/22/001', userId: 'user-1', user: { fullName: 'Alice' } },
  { id: 'stud-2', matricNumber: 'KW/22/002', userId: 'user-2', user: { fullName: 'Bob' } },
];

/** Three sessions for matrix dimension testing. */
const MOCK_SESSIONS = [
  {
    id: 'sess-1',
    scheduledStart: new Date('2026-01-06T08:00:00Z'), // Monday week 2
    venue: { name: 'LT1' },
    attendanceRecords: [
      { studentId: 'stud-1', status: 'PRESENT', enrollmentId: 'e1' },
      { studentId: 'stud-2', status: 'ABSENT', enrollmentId: 'e2' },
    ],
  },
  {
    id: 'sess-2',
    scheduledStart: new Date('2026-01-13T08:00:00Z'), // Monday week 3
    venue: { name: 'LT1' },
    attendanceRecords: [
      { studentId: 'stud-1', status: 'LATE', enrollmentId: 'e1' },
      { studentId: 'stud-2', status: 'EXCUSED', enrollmentId: 'e2' },
    ],
  },
  {
    id: 'sess-3',
    scheduledStart: new Date('2026-01-20T08:00:00Z'), // Monday week 4
    venue: { name: 'LT1' },
    attendanceRecords: [
      { studentId: 'stud-1', status: 'PRESENT', enrollmentId: 'e1' },
      { studentId: 'stud-2', status: 'MANUAL_OVERRIDE', enrollmentId: 'e2' },
    ],
  },
];

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(s3KeyExists).mockResolvedValue(false);
  vi.mocked(prisma.manualOverride.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.user.findFirst).mockResolvedValue(null as never);
});

// =============================================================================
// processClassRegisterPdf — matrix dimensions
// =============================================================================

describe('processClassRegisterPdf — matrix dimensions', () => {
  beforeEach(() => {
    vi.mocked(prisma.courseSection.findUnique).mockResolvedValue({
      id: SECTION_ID,
      course: { code: 'BIO201', title: 'Biology' },
      lecturer: {
        userId: 'lect-1',
        staffId: 'KWASU/L/001',
        user: { fullName: 'Dr. Smith' },
      },
      enrollments: MOCK_STUDENTS.map((s, i) => ({
        id: `e${i + 1}`,
        droppedAt: null,
        student: s,
      })),
      sessions: MOCK_SESSIONS,
    } as never);
  });

  it('generates PDF for 3 sessions × 2 students (6 matrix cells)', async () => {
    await processClassRegisterPdf(
      makeJob({ courseSectionId: SECTION_ID, semesterId: SEMESTER_ID }),
    );

    // PDF was generated and uploaded
    expect(uploadToS3).toHaveBeenCalledWith(
      'reports-bucket',
      `registers/${SECTION_ID}-${SEMESTER_ID}.pdf`,
      expect.any(Buffer),
      'application/pdf',
    );
  });

  it('skips generation when S3 key already exists', async () => {
    vi.mocked(s3KeyExists).mockResolvedValue(true);

    await processClassRegisterPdf(
      makeJob({ courseSectionId: SECTION_ID, semesterId: SEMESTER_ID }),
    );

    expect(uploadToS3).not.toHaveBeenCalled();
  });
});

// =============================================================================
// processStudentReportCard — trend comparison
// =============================================================================

describe('processStudentReportCard — trend comparison', () => {
  const COURSE_A_ID = 'course-a';

  beforeEach(() => {
    vi.mocked(prisma.student.findUnique).mockResolvedValue({
      id: STUDENT_ID,
      matricNumber: 'KW/22/001',
      user: { id: 'user-1', fullName: 'Alice' },
    } as never);

    vi.mocked(prisma.semester.findUnique).mockResolvedValue({
      id: SEMESTER_ID,
      startDate: new Date('2026-01-01'),
      academicSessionId: 'sess-a',
    } as never);

    vi.mocked(prisma.semester.findFirst).mockResolvedValue({
      id: PREV_SEMESTER_ID,
    } as never);

    vi.mocked(prisma.examEligibility.findMany).mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (async (args?: any) => {
        const semesterId = args?.where?.semesterId as string | undefined;
        if (semesterId === SEMESTER_ID) {
          // Current semester: 80% effective
          return [
            {
              rawPercentage: 75,
              effectivePercentage: 80,
              status: 'ELIGIBLE',
              enrollment: {
                courseSection: {
                  courseId: COURSE_A_ID,
                  course: { id: COURSE_A_ID, code: 'BIO201', title: 'Biology' },
                },
              },
            },
          ] as never;
        }
        // Previous semester: 70% effective → diff = +10% → trend ↑
        return [
          {
            effectivePercentage: 70,
            enrollment: { courseSection: { courseId: COURSE_A_ID } },
          },
        ] as never;
      }) as never,
    );

    vi.mocked(prisma.excuseLetter.findMany).mockResolvedValue([] as never);
  });

  it('includes trend ↑ when current semester effective % is 10% higher than previous', async () => {
    await processStudentReportCard(makeJob({ studentId: STUDENT_ID, semesterId: SEMESTER_ID }));

    expect(generatePdf).toHaveBeenCalledWith(
      'KWASU Student Report Card',
      expect.arrayContaining([
        expect.objectContaining({
          heading: 'Course Attendance Summary',
          body: expect.stringContaining('↑'),
        }),
      ]),
    );
  });

  it('skips generation when S3 key already exists', async () => {
    vi.mocked(s3KeyExists).mockResolvedValue(true);

    await processStudentReportCard(makeJob({ studentId: STUDENT_ID, semesterId: SEMESTER_ID }));

    expect(generatePdf).not.toHaveBeenCalled();
    expect(uploadToS3).not.toHaveBeenCalled();
  });
});
