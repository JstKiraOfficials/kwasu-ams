/**
 * @file students.service.test.ts
 * @module modules/students/__tests__
 *
 * Unit tests for the students service layer.
 *
 * All Prisma calls are mocked — no real database connection is used.
 * Tests cover matric number validation, duplicate detection, and scope-aware listing.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Role } from '@kwasu-ams/types';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../../lib/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    student: {
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

import { createStudent, listStudents } from '../students.service.js';
import { prisma } from '../../../lib/prisma.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ACTOR_ID = 'a0000000-0000-4000-8000-000000000001';
const USER_ID = 'a0000000-0000-4000-8000-000000000002';
const PROGRAMME_ID = 'a0000000-0000-4000-8000-000000000010';
const STUDENT_ID = 'a0000000-0000-4000-8000-000000000020';
const DEPT_ID = 'a0000000-0000-4000-8000-000000000030';

const VALID_MATRIC = '22/47CSC/00001';
const INVALID_MATRIC = 'NOT-A-MATRIC';

const STUDENT_RECORD = {
  id: STUDENT_ID,
  userId: USER_ID,
  matricNumber: '22/47CSC/00001',
  programmeId: PROGRAMME_ID,
  level: 200,
  hasCarryOver: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  user: {
    fullName: 'Test Student',
    email: 'test@kwasu.edu.ng',
    phone: '08012345678',
    identifier: '22/47CSC/00001',
    isActive: true,
  },
};

// =============================================================================
// createStudent
// =============================================================================

describe('createStudent', () => {
  beforeEach(() => vi.resetAllMocks());

  it('creates a student with a valid matric number', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: USER_ID,
      role: 'STUDENT',
    } as never);
    vi.mocked(prisma.student.findUnique).mockResolvedValueOnce(null); // no duplicate
    vi.mocked(prisma.student.create).mockResolvedValueOnce(STUDENT_RECORD as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

    const result = await createStudent(
      { userId: USER_ID, matricNumber: VALID_MATRIC, programmeId: PROGRAMME_ID, level: 200 },
      ACTOR_ID,
    );

    expect(result.matricNumber).toBe('22/47CSC/00001');
    expect(prisma.student.create).toHaveBeenCalledOnce();
  });

  it('throws VALIDATION_ERROR for an invalid matric number format', async () => {
    await expect(
      createStudent(
        { userId: USER_ID, matricNumber: INVALID_MATRIC, programmeId: PROGRAMME_ID, level: 200 },
        ACTOR_ID,
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', statusCode: 400, field: 'matricNumber' });

    // No DB calls should be made before validation fails
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('throws CONFLICT for a duplicate matric number', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: USER_ID,
      role: 'STUDENT',
    } as never);
    vi.mocked(prisma.student.findUnique).mockResolvedValueOnce({ id: STUDENT_ID } as never); // duplicate

    await expect(
      createStudent(
        { userId: USER_ID, matricNumber: VALID_MATRIC, programmeId: PROGRAMME_ID, level: 200 },
        ACTOR_ID,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT', statusCode: 409, field: 'matricNumber' });
  });

  it('throws VALIDATION_ERROR when userId does not have role STUDENT', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: USER_ID,
      role: 'LECTURER',
    } as never);

    await expect(
      createStudent(
        { userId: USER_ID, matricNumber: VALID_MATRIC, programmeId: PROGRAMME_ID, level: 200 },
        ACTOR_ID,
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', statusCode: 400 });
  });
});

// =============================================================================
// listStudents — scope enforcement
// =============================================================================

describe('listStudents', () => {
  beforeEach(() => vi.resetAllMocks());

  it('filters by departmentId for HOD role', async () => {
    vi.mocked(prisma.student.findMany).mockResolvedValueOnce([STUDENT_RECORD] as never);
    vi.mocked(prisma.student.count).mockResolvedValueOnce(1);

    await listStudents({ page: 1, pageSize: 20 }, Role.HOD, DEPT_ID, ACTOR_ID);

    expect(prisma.student.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          programme: { departmentId: DEPT_ID },
        }),
      }),
    );
  });

  it('applies no scope filter for SUPER_ADMIN', async () => {
    vi.mocked(prisma.student.findMany).mockResolvedValueOnce([STUDENT_RECORD] as never);
    vi.mocked(prisma.student.count).mockResolvedValueOnce(1);

    await listStudents({ page: 1, pageSize: 20 }, Role.SUPER_ADMIN, null, ACTOR_ID);

    expect(prisma.student.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
  });
});
