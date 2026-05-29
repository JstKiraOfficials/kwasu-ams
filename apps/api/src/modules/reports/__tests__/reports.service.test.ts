/**
 * @file reports.service.test.ts
 * @module modules/reports/__tests__
 *
 * Unit tests for the certificate generation service.
 *
 * All Prisma, S3, and PDF generation calls are mocked.
 *
 * Test coverage:
 *
 * generateAttendanceCertificate
 * - Completed semester → returns downloadUrl and checksum
 * - Active semester → throws VALIDATION_ERROR (400)
 * - Certificate already exists in S3 → returns existing URL without regenerating
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../../lib/prisma.js', () => ({
  prisma: {
    semester: { findUnique: vi.fn() },
    student: { findUnique: vi.fn() },
    courseSection: { findUnique: vi.fn() },
    examEligibility: { findFirst: vi.fn() },
  },
}));

vi.mock('../../../lib/pdf-generator.js', () => ({
  generatePdf: vi.fn().mockResolvedValue({ buffer: Buffer.from('pdf'), checksum: 'abc123' }),
}));

vi.mock('../../../lib/s3.js', () => ({
  uploadToS3: vi.fn().mockResolvedValue(undefined),
  getPresignedUrl: vi.fn().mockResolvedValue('https://s3.example.com/cert.pdf'),
  s3KeyExists: vi.fn().mockResolvedValue(false),
}));

vi.mock('../../../config/env.js', () => ({
  env: { AWS_S3_BUCKET_REPORTS: 'reports-bucket' },
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { generateAttendanceCertificate } from '../certificate.service.js';
import { prisma } from '../../../lib/prisma.js';
import { generatePdf } from '../../../lib/pdf-generator.js';
import { uploadToS3, s3KeyExists } from '../../../lib/s3.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const STUDENT_ID = 'a0000000-0000-4000-8000-000000000001';
const COURSE_SECTION_ID = 'a0000000-0000-4000-8000-000000000002';
const SEMESTER_ID = 'a0000000-0000-4000-8000-000000000003';

const COMPLETED_SEMESTER = {
  id: SEMESTER_ID,
  isActive: false,
  type: 'FIRST',
  academicSession: { name: '2024/2025' },
};

const ACTIVE_SEMESTER = { ...COMPLETED_SEMESTER, isActive: true };

const MOCK_STUDENT = {
  id: STUDENT_ID,
  matricNumber: 'KWASU/22/0001',
  user: { fullName: 'Alice Johnson' },
};

const MOCK_SECTION = {
  id: COURSE_SECTION_ID,
  course: { code: 'BIO201', title: 'General Biology II' },
};

const MOCK_ELIGIBILITY = { effectivePercentage: 82.5, status: 'ELIGIBLE' };

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.semester.findUnique).mockResolvedValue(COMPLETED_SEMESTER as never);
  vi.mocked(prisma.student.findUnique).mockResolvedValue(MOCK_STUDENT as never);
  vi.mocked(prisma.courseSection.findUnique).mockResolvedValue(MOCK_SECTION as never);
  vi.mocked(prisma.examEligibility.findFirst).mockResolvedValue(MOCK_ELIGIBILITY as never);
  vi.mocked(s3KeyExists).mockResolvedValue(false);
});

// =============================================================================
// Completed semester — success path
// =============================================================================

describe('generateAttendanceCertificate — completed semester', () => {
  it('returns downloadUrl and checksum for a completed semester', async () => {
    const result = await generateAttendanceCertificate(STUDENT_ID, COURSE_SECTION_ID, SEMESTER_ID);

    expect(result).toMatchObject({
      downloadUrl: expect.stringContaining('s3.example.com'),
      checksum: 'abc123',
    });
    expect(generatePdf).toHaveBeenCalledOnce();
    expect(uploadToS3).toHaveBeenCalledWith(
      'reports-bucket',
      `certificates/${STUDENT_ID}/${COURSE_SECTION_ID}-${SEMESTER_ID}.pdf`,
      expect.any(Buffer),
      'application/pdf',
    );
  });
});

// =============================================================================
// Active semester — throws VALIDATION_ERROR
// =============================================================================

describe('generateAttendanceCertificate — active semester', () => {
  it('throws VALIDATION_ERROR (400) when semester is still active', async () => {
    vi.mocked(prisma.semester.findUnique).mockResolvedValue(ACTIVE_SEMESTER as never);

    await expect(
      generateAttendanceCertificate(STUDENT_ID, COURSE_SECTION_ID, SEMESTER_ID),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', statusCode: 400 });

    // PDF should never be generated
    expect(generatePdf).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Idempotency — existing S3 key returns same URL
// =============================================================================

describe('generateAttendanceCertificate — idempotency', () => {
  it('returns existing pre-signed URL without regenerating when S3 key exists', async () => {
    vi.mocked(s3KeyExists).mockResolvedValue(true);

    const result = await generateAttendanceCertificate(STUDENT_ID, COURSE_SECTION_ID, SEMESTER_ID);

    expect(result.downloadUrl).toContain('s3.example.com');
    // PDF was never generated and S3 was never written to
    expect(generatePdf).not.toHaveBeenCalled();
    expect(uploadToS3).not.toHaveBeenCalled();
  });
});
