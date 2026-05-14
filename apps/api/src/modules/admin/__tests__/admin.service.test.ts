/**
 * @file admin.service.test.ts
 * @module modules/admin/__tests__
 *
 * Unit tests for the admin service layer.
 *
 * All external dependencies (Prisma, S3, Argon2) are mocked so tests run
 * without a real database or network connection.
 *
 * Coverage targets:
 * - createUser: happy path, identifier format validation, duplicate conflict
 * - importUsers: happy path, S3 upload called, jobId returned
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Buffer } from 'node:buffer';
import { Role } from '@kwasu-ams/types';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../../lib/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn(), create: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));

vi.mock('../../../lib/argon2.js', () => ({
  hashPassword: vi.fn().mockResolvedValue('$argon2id$hashed'),
}));

vi.mock('../../../lib/s3.js', () => ({
  uploadToS3: vi.fn().mockResolvedValue(undefined),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CREATED_USER = {
  id: 'new-user-1',
  identifier: 'KWASU/LEC/CSC/00200',
  fullName: 'Test Lecturer',
  email: 'test@kwasu.edu.ng',
  phone: '+2348012345678',
  role: 'LECTURER',
  scopeId: null,
  mustChangePassword: true,
  totpEnrolled: false,
  languagePreference: 'en',
  fcmToken: null,
  isActive: true,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const LECTURER_INPUT = {
  identifier: 'KWASU/LEC/CSC/00200',
  fullName: 'Test Lecturer',
  email: 'test@kwasu.edu.ng',
  phone: '+2348012345678',
  role: Role.LECTURER,
};

// ── createUser ────────────────────────────────────────────────────────────────

describe('admin.service — createUser', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a user and returns IUserPublic on valid staff input', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);
    vi.mocked(prisma.user.create).mockResolvedValueOnce(CREATED_USER as never);

    const { createUser } = await import('../admin.service.js');
    const result = await createUser(LECTURER_INPUT, 'admin-1', 'SUPER_ADMIN');

    expect(result.identifier).toBe('KWASU/LEC/CSC/00200');
    expect(result.mustChangePassword).toBe(true);
    // Sensitive fields must not be present
    expect((result as Record<string, unknown>).passwordHash).toBeUndefined();
    expect((result as Record<string, unknown>).totpSecret).toBeUndefined();
  });

  it('creates a student user with a normalised matric number', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    const studentUser = {
      ...CREATED_USER,
      identifier: '22/47CSC/00001',
      role: 'STUDENT',
    };
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);
    vi.mocked(prisma.user.create).mockResolvedValueOnce(studentUser as never);

    const { createUser } = await import('../admin.service.js');
    const result = await createUser(
      {
        identifier: '22/47csc/00001', // lowercase — should be normalised
        fullName: 'Test Student',
        email: 'student@kwasu.edu.ng',
        phone: '+2348012345679',
        role: Role.STUDENT,
      },
      'admin-1',
      'SUPER_ADMIN',
    );

    // Prisma create should have been called with the normalised identifier
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ identifier: '22/47CSC/00001' }),
      }),
    );
    expect(result.role).toBe('STUDENT');
  });

  it('throws VALIDATION_ERROR when a student role is given a staff ID', async () => {
    const { createUser } = await import('../admin.service.js');
    await expect(
      createUser(
        {
          identifier: 'KWASU/LEC/CSC/00200', // staff ID for a student role
          fullName: 'Bad Student',
          email: 'bad@kwasu.edu.ng',
          phone: '+2348012345678',
          role: Role.STUDENT,
        },
        'admin-1',
        'SUPER_ADMIN',
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', field: 'identifier' });
  });

  it('throws VALIDATION_ERROR when a staff role is given a matric number', async () => {
    const { createUser } = await import('../admin.service.js');
    await expect(
      createUser(
        {
          identifier: '22/47CSC/00001', // matric number for a lecturer role
          fullName: 'Bad Lecturer',
          email: 'bad@kwasu.edu.ng',
          phone: '+2348012345678',
          role: Role.LECTURER,
        },
        'admin-1',
        'SUPER_ADMIN',
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', field: 'identifier' });
  });

  it('throws CONFLICT when the identifier already exists', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({ id: 'existing-1' } as never);

    const { createUser } = await import('../admin.service.js');
    await expect(createUser(LECTURER_INPUT, 'admin-1', 'SUPER_ADMIN')).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('writes an audit log entry on successful creation', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);
    vi.mocked(prisma.user.create).mockResolvedValueOnce(CREATED_USER as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValueOnce({} as never);

    const { createUser } = await import('../admin.service.js');
    await createUser(LECTURER_INPUT, 'admin-1', 'SUPER_ADMIN');

    // Allow the fire-and-forget audit log to settle
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'USER_CREATED' }),
      }),
    );
  });
});

// ── importUsers ───────────────────────────────────────────────────────────────

describe('admin.service — importUsers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uploads the CSV to S3 and returns a jobId', async () => {
    const { uploadToS3 } = await import('../../../lib/s3.js');
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.auditLog.create).mockResolvedValueOnce({} as never);

    const { importUsers } = await import('../admin.service.js');
    const csvBuffer = Buffer.from('identifier,fullName\nKWASU/LEC/CSC/00300,Test\n');
    const result = await importUsers(csvBuffer, 'admin-1', 'SUPER_ADMIN');

    expect(uploadToS3).toHaveBeenCalledWith(
      expect.any(String), // bucket
      expect.stringMatching(/^imports\//), // key starts with imports/
      csvBuffer,
      'text/csv',
    );
    expect(result.jobId).toBeDefined();
    expect(typeof result.jobId).toBe('string');
  });

  it('writes a BULK_IMPORT_STARTED audit log entry', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.auditLog.create).mockResolvedValueOnce({} as never);

    const { importUsers } = await import('../admin.service.js');
    await importUsers(Buffer.from('data'), 'admin-1', 'SUPER_ADMIN');

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'BULK_IMPORT_STARTED' }),
      }),
    );
  });
});
