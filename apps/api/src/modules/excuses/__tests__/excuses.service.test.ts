/**
 * @file excuses.service.test.ts
 * @module modules/excuses/__tests__
 *
 * Unit tests for the excuses service.
 *
 * All Prisma, S3, and anomaly service calls are mocked. Tests cover the
 * core business logic paths without requiring real infrastructure.
 *
 * Test coverage:
 *
 * submitExcuse
 * - Throws VALIDATION_ERROR when reason is OTHER and explanation < 30 chars
 * - Throws VALIDATION_ERROR when more than 3 files are provided
 * - Creates excuse and uploads files on valid input
 *
 * reviewExcuse
 * - Updates AttendanceRecord to EXCUSED on APPROVED decision
 * - Throws EXCUSE_LIMIT_REACHED when student has 4 approved excuses
 * - Throws CONFLICT on invalid state transition
 *
 * appealExcuse
 * - Transitions REJECTED → APPEAL_SUBMITTED
 * - Throws FORBIDDEN when student does not own the excuse
 *
 * hodReviewExcuse
 * - Updates AttendanceRecord to EXCUSED on HOD_APPROVED decision
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Mocks
// =============================================================================

vi.mock('../../../lib/prisma.js', () => ({
  prisma: {
    student: { findUnique: vi.fn() },
    courseEnrollment: { findFirst: vi.fn(), findMany: vi.fn() },
    excuseLetter: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    courseSession: { findMany: vi.fn() },
    attendanceRecord: {
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    semester: { findFirst: vi.fn() },
    auditLog: { create: vi.fn() },
    lecturer: { findUnique: vi.fn() },
  },
}));

vi.mock('../../../lib/s3.js', () => ({
  uploadToS3: vi.fn().mockResolvedValue(undefined),
  getPresignedUrl: vi.fn().mockResolvedValue('https://s3.example.com/presigned'),
}));

vi.mock('../../anomalies/anomalies.service.js', () => ({
  createAnomalyFlag: vi.fn().mockResolvedValue({}),
}));

// =============================================================================
// Imports (after mocks)
// =============================================================================

import { submitExcuse, reviewExcuse, appealExcuse, hodReviewExcuse } from '../excuses.service.js';
import { prisma } from '../../../lib/prisma.js';
import { ExcuseReason, ExcuseStatus } from '@kwasu-ams/types';

// =============================================================================
// Fixtures
// =============================================================================

const USER_ID = 'a0000000-0000-4000-8000-000000000001';
const STUDENT_ID = 'a0000000-0000-4000-8000-000000000002';
const EXCUSE_ID = 'a0000000-0000-4000-8000-000000000003';
const SECTION_ID = 'a0000000-0000-4000-8000-000000000004';
const ENROLLMENT_ID = 'a0000000-0000-4000-8000-000000000005';
const OTHER_USER_ID = 'a0000000-0000-4000-8000-000000000099';

const makeStudent = () => ({ id: STUDENT_ID });
const makeEnrollment = () => ({
  id: ENROLLMENT_ID,
  studentId: STUDENT_ID,
  courseSectionId: SECTION_ID,
});
const makeSemester = (maxApprovedExcuses = 4) => ({ id: 'sem-1', maxApprovedExcuses });

const makeExcuse = (status: ExcuseStatus = ExcuseStatus.UNDER_REVIEW) => ({
  id: EXCUSE_ID,
  studentId: STUDENT_ID,
  courseSectionId: SECTION_ID,
  absenceDates: [new Date('2026-03-10T08:00:00Z')],
  reason: ExcuseReason.MEDICAL,
  otherExplanation: null,
  documentS3Keys: [],
  status,
  lecturerComment: null,
  lecturerReviewedById: null,
  lecturerReviewedAt: null,
  hodComment: null,
  hodReviewedById: null,
  hodReviewedAt: null,
  appealReason: null,
  appealSubmittedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  student: { id: STUDENT_ID, user: { id: USER_ID } },
});

/** A minimal valid file upload. */
const makeFile = () => ({
  filename: 'doc.pdf',
  mimetype: 'application/pdf',
  buffer: Buffer.from('fake-pdf-content'),
  size: 100,
});

const validSubmitInput = {
  courseSectionId: SECTION_ID,
  absenceDates: ['2026-03-10T08:00:00.000Z'],
  reason: ExcuseReason.MEDICAL,
};

// =============================================================================
// Shared setup
// =============================================================================

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);
  vi.mocked(prisma.semester.findFirst).mockResolvedValue(makeSemester() as never);
  vi.mocked(prisma.courseSession.findMany).mockResolvedValue([]);
  vi.mocked(prisma.attendanceRecord.findUnique).mockResolvedValue(null);
  vi.mocked(prisma.excuseLetter.findMany).mockResolvedValue([]);
});

// =============================================================================
// submitExcuse
// =============================================================================

describe('submitExcuse', () => {
  it('throws VALIDATION_ERROR when reason is OTHER and explanation is shorter than 30 chars', async () => {
    vi.mocked(prisma.student.findUnique).mockResolvedValue(makeStudent() as never);
    vi.mocked(prisma.courseEnrollment.findFirst).mockResolvedValue(makeEnrollment() as never);

    await expect(
      submitExcuse(
        USER_ID,
        { ...validSubmitInput, reason: ExcuseReason.OTHER, otherExplanation: 'Too short' },
        [],
      ),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      field: 'otherExplanation',
    });
  });

  it('throws VALIDATION_ERROR when more than 3 files are provided', async () => {
    vi.mocked(prisma.student.findUnique).mockResolvedValue(makeStudent() as never);
    vi.mocked(prisma.courseEnrollment.findFirst).mockResolvedValue(makeEnrollment() as never);

    const files = [makeFile(), makeFile(), makeFile(), makeFile()]; // 4 files

    await expect(submitExcuse(USER_ID, validSubmitInput, files)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      field: 'files',
    });
  });

  it('creates excuse and uploads files on valid input', async () => {
    vi.mocked(prisma.student.findUnique).mockResolvedValue(makeStudent() as never);
    vi.mocked(prisma.courseEnrollment.findFirst).mockResolvedValue(makeEnrollment() as never);
    vi.mocked(prisma.excuseLetter.create).mockResolvedValue(
      makeExcuse(ExcuseStatus.SUBMITTED) as never,
    );

    const result = await submitExcuse(USER_ID, validSubmitInput, [makeFile()]);

    expect(prisma.excuseLetter.create).toHaveBeenCalledOnce();
    expect(result.status).toBe(ExcuseStatus.SUBMITTED);
  });

  it('throws NOT_FOUND when student does not exist', async () => {
    vi.mocked(prisma.student.findUnique).mockResolvedValue(null);

    await expect(submitExcuse(USER_ID, validSubmitInput, [])).rejects.toMatchObject({
      code: 'NOT_FOUND',
      statusCode: 404,
    });
  });
});

// =============================================================================
// reviewExcuse
// =============================================================================

describe('reviewExcuse', () => {
  it('updates AttendanceRecord to EXCUSED on APPROVED decision', async () => {
    vi.mocked(prisma.excuseLetter.findUnique).mockResolvedValue(makeExcuse() as never);
    vi.mocked(prisma.excuseLetter.count).mockResolvedValue(0); // 0 approved so far
    vi.mocked(prisma.excuseLetter.update).mockResolvedValue(
      makeExcuse(ExcuseStatus.APPROVED) as never,
    );
    vi.mocked(prisma.courseEnrollment.findFirst).mockResolvedValue(makeEnrollment() as never);

    const result = await reviewExcuse(
      EXCUSE_ID,
      { decision: 'APPROVED', comment: 'Valid medical excuse.' },
      USER_ID,
    );

    expect(result.status).toBe(ExcuseStatus.APPROVED);
  });

  it('throws EXCUSE_LIMIT_REACHED when student already has 4 approved excuses', async () => {
    vi.mocked(prisma.excuseLetter.findUnique).mockResolvedValue(makeExcuse() as never);
    vi.mocked(prisma.excuseLetter.count).mockResolvedValue(4); // already at limit

    await expect(
      reviewExcuse(EXCUSE_ID, { decision: 'APPROVED', comment: 'Valid excuse.' }, USER_ID),
    ).rejects.toMatchObject({ code: 'EXCUSE_LIMIT_REACHED', statusCode: 400 });
  });

  it('throws CONFLICT on invalid state transition (APPROVED → APPROVED)', async () => {
    vi.mocked(prisma.excuseLetter.findUnique).mockResolvedValue(
      makeExcuse(ExcuseStatus.APPROVED) as never,
    );

    await expect(
      reviewExcuse(EXCUSE_ID, { decision: 'APPROVED', comment: 'Valid excuse.' }, USER_ID),
    ).rejects.toMatchObject({ code: 'CONFLICT', statusCode: 409 });
  });

  it('updates status to REJECTED on REJECTED decision', async () => {
    vi.mocked(prisma.excuseLetter.findUnique).mockResolvedValue(makeExcuse() as never);
    vi.mocked(prisma.excuseLetter.update).mockResolvedValue(
      makeExcuse(ExcuseStatus.REJECTED) as never,
    );

    const result = await reviewExcuse(
      EXCUSE_ID,
      { decision: 'REJECTED', comment: 'Insufficient documentation.' },
      USER_ID,
    );

    expect(result.status).toBe(ExcuseStatus.REJECTED);
  });
});

// =============================================================================
// appealExcuse
// =============================================================================

describe('appealExcuse', () => {
  it('transitions REJECTED → APPEAL_SUBMITTED', async () => {
    vi.mocked(prisma.excuseLetter.findUnique).mockResolvedValue(
      makeExcuse(ExcuseStatus.REJECTED) as never,
    );
    vi.mocked(prisma.excuseLetter.update).mockResolvedValue(
      makeExcuse(ExcuseStatus.APPEAL_SUBMITTED) as never,
    );

    const result = await appealExcuse(
      EXCUSE_ID,
      { appealReason: 'I was genuinely ill and have additional documentation.' },
      USER_ID,
    );

    expect(result.status).toBe(ExcuseStatus.APPEAL_SUBMITTED);
  });

  it('throws FORBIDDEN when student does not own the excuse', async () => {
    vi.mocked(prisma.excuseLetter.findUnique).mockResolvedValue(
      makeExcuse(ExcuseStatus.REJECTED) as never,
    );

    await expect(
      appealExcuse(
        EXCUSE_ID,
        { appealReason: 'I was genuinely ill and have additional documentation.' },
        OTHER_USER_ID, // different user
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
  });

  it('throws CONFLICT when excuse is not in REJECTED state', async () => {
    vi.mocked(prisma.excuseLetter.findUnique).mockResolvedValue(
      makeExcuse(ExcuseStatus.APPROVED) as never,
    );

    await expect(
      appealExcuse(
        EXCUSE_ID,
        { appealReason: 'I was genuinely ill and have additional documentation.' },
        USER_ID,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT', statusCode: 409 });
  });
});

// =============================================================================
// hodReviewExcuse
// =============================================================================

describe('hodReviewExcuse', () => {
  it('updates AttendanceRecord to EXCUSED on HOD_APPROVED decision', async () => {
    vi.mocked(prisma.excuseLetter.findUnique).mockResolvedValue(
      makeExcuse(ExcuseStatus.APPEAL_SUBMITTED) as never,
    );
    vi.mocked(prisma.excuseLetter.count).mockResolvedValue(0);
    vi.mocked(prisma.excuseLetter.update).mockResolvedValue(
      makeExcuse(ExcuseStatus.HOD_APPROVED) as never,
    );
    vi.mocked(prisma.courseEnrollment.findFirst).mockResolvedValue(makeEnrollment() as never);

    const result = await hodReviewExcuse(
      EXCUSE_ID,
      { decision: 'HOD_APPROVED', comment: 'Appeal upheld after review.' },
      USER_ID,
    );

    expect(result.status).toBe(ExcuseStatus.HOD_APPROVED);
  });

  it('throws CONFLICT on invalid state transition', async () => {
    vi.mocked(prisma.excuseLetter.findUnique).mockResolvedValue(
      makeExcuse(ExcuseStatus.SUBMITTED) as never,
    );

    await expect(
      hodReviewExcuse(EXCUSE_ID, { decision: 'HOD_APPROVED', comment: 'Appeal upheld.' }, USER_ID),
    ).rejects.toMatchObject({ code: 'CONFLICT', statusCode: 409 });
  });
});
