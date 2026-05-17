/**
 * @file lecturers.service.test.ts
 * @module modules/lecturers/__tests__
 *
 * Unit tests for the lecturers service layer.
 *
 * All Prisma calls are mocked — no real database connection is used.
 * Tests cover staff ID validation, duplicate detection, and
 * accountabilityScore access control by role.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Role } from '@kwasu-ams/types';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../../lib/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    lecturer: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    auditLog: { create: vi.fn() },
  },
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { createLecturer, getLecturerById } from '../lecturers.service.js';
import { prisma } from '../../../lib/prisma.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ACTOR_ID = 'a0000000-0000-4000-8000-000000000001';
const USER_ID = 'a0000000-0000-4000-8000-000000000002';
const DEPT_ID = 'a0000000-0000-4000-8000-000000000010';
const LECTURER_ID = 'a0000000-0000-4000-8000-000000000020';

const VALID_STAFF_ID = 'KWASU/LEC/CSC/00134';
const INVALID_STAFF_ID = 'NOT-A-STAFF-ID';

const LECTURER_RECORD_PUBLIC = {
  id: LECTURER_ID,
  userId: USER_ID,
  staffId: VALID_STAFF_ID,
  departmentId: DEPT_ID,
  title: 'Dr.',
  createdAt: new Date(),
  updatedAt: new Date(),
  user: {
    fullName: 'Dr. Test',
    email: 'test@kwasu.edu.ng',
    phone: '08012345678',
    identifier: VALID_STAFF_ID,
    isActive: true,
  },
  department: { name: 'Computer Science', code: 'CSC' },
};

const LECTURER_RECORD_WITH_SCORE = {
  ...LECTURER_RECORD_PUBLIC,
  accountabilityScore: 92.5,
};

// =============================================================================
// createLecturer
// =============================================================================

describe('createLecturer', () => {
  beforeEach(() => vi.resetAllMocks());

  it('creates a lecturer with a valid staff ID', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: USER_ID,
      role: 'LECTURER',
    } as never);
    vi.mocked(prisma.lecturer.findUnique).mockResolvedValueOnce(null); // no duplicate
    vi.mocked(prisma.lecturer.create).mockResolvedValueOnce(LECTURER_RECORD_PUBLIC as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

    const result = await createLecturer(
      { userId: USER_ID, staffId: VALID_STAFF_ID, departmentId: DEPT_ID },
      ACTOR_ID,
    );

    expect(result.staffId).toBe(VALID_STAFF_ID);
    expect(prisma.lecturer.create).toHaveBeenCalledOnce();
  });

  it('throws VALIDATION_ERROR for an invalid staff ID format', async () => {
    await expect(
      createLecturer(
        { userId: USER_ID, staffId: INVALID_STAFF_ID, departmentId: DEPT_ID },
        ACTOR_ID,
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', statusCode: 400, field: 'staffId' });

    // No DB calls before validation fails
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('throws CONFLICT for a duplicate staff ID', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: USER_ID,
      role: 'LECTURER',
    } as never);
    vi.mocked(prisma.lecturer.findUnique).mockResolvedValueOnce({ id: LECTURER_ID } as never); // duplicate

    await expect(
      createLecturer({ userId: USER_ID, staffId: VALID_STAFF_ID, departmentId: DEPT_ID }, ACTOR_ID),
    ).rejects.toMatchObject({ code: 'CONFLICT', statusCode: 409, field: 'staffId' });
  });
});

// =============================================================================
// getLecturerById — accountabilityScore access control
// =============================================================================

describe('getLecturerById', () => {
  beforeEach(() => vi.resetAllMocks());

  it('does NOT include accountabilityScore when requesting role is LECTURER', async () => {
    // Return a record without accountabilityScore (public select)
    vi.mocked(prisma.lecturer.findUnique).mockResolvedValueOnce(LECTURER_RECORD_PUBLIC as never);

    const result = await getLecturerById(LECTURER_ID, Role.LECTURER);

    expect('accountabilityScore' in result).toBe(false);
  });

  it('includes accountabilityScore when requesting role is HOD', async () => {
    // Return a record with accountabilityScore (full select)
    vi.mocked(prisma.lecturer.findUnique).mockResolvedValueOnce(
      LECTURER_RECORD_WITH_SCORE as never,
    );

    const result = await getLecturerById(LECTURER_ID, Role.HOD);

    expect('accountabilityScore' in result).toBe(true);
    expect((result as typeof LECTURER_RECORD_WITH_SCORE).accountabilityScore).toBe(92.5);
  });

  it('throws NOT_FOUND when lecturer does not exist', async () => {
    vi.mocked(prisma.lecturer.findUnique).mockResolvedValueOnce(null);

    await expect(getLecturerById(LECTURER_ID, Role.HOD)).rejects.toMatchObject({
      code: 'NOT_FOUND',
      statusCode: 404,
    });
  });
});
