/**
 * @file admin.service.test.ts
 * @module modules/admin/__tests__
 *
 * Unit tests for the admin service layer — Phase 12 additions.
 *
 * Tests cover:
 * - `listUsers`: pagination, role filter, search filter, ACADEMIC_AFFAIRS scope restriction
 * - `getUserById`: happy path, NOT_FOUND
 * - `updateUser`: field updates, AuditLog with before/after, NOT_FOUND
 * - `deleteUser`: soft-delete, AuditLog, NOT_FOUND
 * - `processBulkImport`: valid CSV creates accounts, invalid row returns errors,
 *   duplicate identifier is skipped
 *
 * All external dependencies (Prisma, S3, Argon2) are mocked so tests run
 * without a real database or network connection.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Buffer } from 'node:buffer';
import { Role } from '@kwasu-ams/types';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../../lib/prisma.js', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    auditLog: { create: vi.fn() },
  },
}));

vi.mock('../../../lib/argon2.js', () => ({
  hashPassword: vi.fn().mockResolvedValue('$argon2id$hashed'),
}));

vi.mock('../../../lib/s3.js', () => ({
  uploadToS3: vi.fn().mockResolvedValue(undefined),
  s3Client: {
    send: vi.fn(),
  },
}));

vi.mock('../../auth/totp.service.js', () => ({
  adminResetTotp: vi.fn().mockResolvedValue(undefined),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BASE_USER = {
  id: 'user-1',
  identifier: 'KWASU/LEC/CSC/00200',
  fullName: 'Test Lecturer',
  email: 'test@kwasu.edu.ng',
  phone: '+2348012345678',
  role: 'LECTURER' as const,
  scopeId: null,
  mustChangePassword: true,
  totpEnrolled: false,
  languagePreference: 'en',
  fcmToken: null,
  isActive: true,
  deletedAt: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

const STUDENT_USER = {
  ...BASE_USER,
  id: 'user-2',
  identifier: '22/47CSC/00001',
  role: 'STUDENT' as const,
};

const LECTURER_INPUT = {
  identifier: 'KWASU/LEC/CSC/00200',
  fullName: 'Test Lecturer',
  email: 'test@kwasu.edu.ng',
  phone: '+2348012345678',
  role: Role.LECTURER,
};

// ── listUsers ─────────────────────────────────────────────────────────────────

describe('admin.service — listUsers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns all active users paginated with no filters', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findMany).mockResolvedValueOnce([BASE_USER, STUDENT_USER] as never);
    vi.mocked(prisma.user.count).mockResolvedValueOnce(2);

    const { listUsers } = await import('../admin.service.js');
    const result = await listUsers({ page: 1, pageSize: 20 }, Role.SUPER_ADMIN, null);

    expect(result.data).toHaveLength(2);
    expect(result.meta.total).toBe(2);
    expect(result.meta.page).toBe(1);
    expect(result.meta.pageSize).toBe(20);
    expect(result.meta.totalPages).toBe(1);

    // where clause must include deletedAt: null
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ deletedAt: null }),
      }),
    );
  });

  it('filters by role when role is provided', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findMany).mockResolvedValueOnce([STUDENT_USER] as never);
    vi.mocked(prisma.user.count).mockResolvedValueOnce(1);

    const { listUsers } = await import('../admin.service.js');
    await listUsers({ page: 1, pageSize: 20, role: Role.STUDENT }, Role.SUPER_ADMIN, null);

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ role: Role.STUDENT }),
      }),
    );
  });

  it('applies search filter on fullName and identifier', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findMany).mockResolvedValueOnce([BASE_USER] as never);
    vi.mocked(prisma.user.count).mockResolvedValueOnce(1);

    const { listUsers } = await import('../admin.service.js');
    await listUsers({ page: 1, pageSize: 20, search: 'john' }, Role.SUPER_ADMIN, null);

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { fullName: { contains: 'john', mode: 'insensitive' } },
            { identifier: { contains: 'john', mode: 'insensitive' } },
          ],
        }),
      }),
    );
  });

  it('restricts ACADEMIC_AFFAIRS actor to their scopeId', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findMany).mockResolvedValueOnce([BASE_USER] as never);
    vi.mocked(prisma.user.count).mockResolvedValueOnce(1);

    const { listUsers } = await import('../admin.service.js');
    await listUsers({ page: 1, pageSize: 20 }, Role.ACADEMIC_AFFAIRS, 'faculty-scope-id');

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ scopeId: 'faculty-scope-id' }),
      }),
    );
  });

  it('does not restrict SUPER_ADMIN by scope', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findMany).mockResolvedValueOnce([BASE_USER] as never);
    vi.mocked(prisma.user.count).mockResolvedValueOnce(1);

    const { listUsers } = await import('../admin.service.js');
    await listUsers({ page: 1, pageSize: 20 }, Role.SUPER_ADMIN, null);

    const callArg = vi.mocked(prisma.user.findMany).mock.calls[0]![0] as {
      where: Record<string, unknown>;
    };
    expect(callArg.where.scopeId).toBeUndefined();
  });
});

// ── getUserById ───────────────────────────────────────────────────────────────

describe('admin.service — getUserById', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns IUserPublic for a valid user ID', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(BASE_USER as never);

    const { getUserById } = await import('../admin.service.js');
    const result = await getUserById('user-1');

    expect(result.id).toBe('user-1');
    expect(result.identifier).toBe('KWASU/LEC/CSC/00200');
    expect((result as Record<string, unknown>).passwordHash).toBeUndefined();
  });

  it('throws NOT_FOUND for a non-existent user ID', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);

    const { getUserById } = await import('../admin.service.js');
    await expect(getUserById('nonexistent-id')).rejects.toMatchObject({
      code: 'NOT_FOUND',
      statusCode: 404,
    });
  });
});

// ── updateUser ────────────────────────────────────────────────────────────────

describe('admin.service — updateUser', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates fields and returns the updated IUserPublic', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    const updatedUser = { ...BASE_USER, fullName: 'Updated Name' };
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(BASE_USER as never);
    vi.mocked(prisma.user.update).mockResolvedValueOnce(updatedUser as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValueOnce({} as never);

    const { updateUser } = await import('../admin.service.js');
    const result = await updateUser('user-1', { fullName: 'Updated Name' }, 'admin-1');

    expect(result.fullName).toBe('Updated Name');
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: expect.objectContaining({ fullName: 'Updated Name' }),
      }),
    );
  });

  it('writes AuditLog with before/after snapshots', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    const updatedUser = { ...BASE_USER, fullName: 'Updated Name' };
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(BASE_USER as never);
    vi.mocked(prisma.user.update).mockResolvedValueOnce(updatedUser as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValueOnce({} as never);

    const { updateUser } = await import('../admin.service.js');
    await updateUser('user-1', { fullName: 'Updated Name' }, 'admin-1');

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'USER_UPDATED',
          beforeJson: expect.objectContaining({ fullName: 'Test Lecturer' }),
          afterJson: expect.objectContaining({ fullName: 'Updated Name' }),
        }),
      }),
    );
  });

  it('throws NOT_FOUND when user does not exist', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);

    const { updateUser } = await import('../admin.service.js');
    await expect(updateUser('nonexistent', { fullName: 'X' }, 'admin-1')).rejects.toMatchObject({
      code: 'NOT_FOUND',
      statusCode: 404,
    });
  });

  it('throws VALIDATION_ERROR when scoped role is given null scopeId', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      ...BASE_USER,
      role: 'LECTURER',
      scopeId: 'dept-1',
    } as never);

    const { updateUser } = await import('../admin.service.js');
    await expect(
      updateUser('user-1', { role: Role.HOD, scopeId: null }, 'admin-1'),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      field: 'scopeId',
    });
  });
});

// ── deleteUser ────────────────────────────────────────────────────────────────

describe('admin.service — deleteUser', () => {
  beforeEach(() => vi.clearAllMocks());

  it('soft-deletes the user by setting deletedAt and isActive: false', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({ id: 'user-1' } as never);
    vi.mocked(prisma.user.update).mockResolvedValueOnce({} as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValueOnce({} as never);

    const { deleteUser } = await import('../admin.service.js');
    await deleteUser('user-1', 'admin-1');

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { deletedAt: expect.any(Date), isActive: false },
    });
  });

  it('writes a USER_DELETED AuditLog entry', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({ id: 'user-1' } as never);
    vi.mocked(prisma.user.update).mockResolvedValueOnce({} as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValueOnce({} as never);

    const { deleteUser } = await import('../admin.service.js');
    await deleteUser('user-1', 'admin-1');

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'USER_DELETED', entityId: 'user-1' }),
      }),
    );
  });

  it('throws NOT_FOUND when user does not exist', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);

    const { deleteUser } = await import('../admin.service.js');
    await expect(deleteUser('nonexistent', 'admin-1')).rejects.toMatchObject({
      code: 'NOT_FOUND',
      statusCode: 404,
    });
  });
});

// ── createUser (Phase 10 — regression) ───────────────────────────────────────

describe('admin.service — createUser', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a user and returns IUserPublic on valid staff input', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);
    vi.mocked(prisma.user.create).mockResolvedValueOnce(BASE_USER as never);

    const { createUser } = await import('../admin.service.js');
    const result = await createUser(LECTURER_INPUT, 'admin-1', 'SUPER_ADMIN');

    expect(result.identifier).toBe('KWASU/LEC/CSC/00200');
    expect(result.mustChangePassword).toBe(true);
    expect((result as Record<string, unknown>).passwordHash).toBeUndefined();
  });

  it('throws VALIDATION_ERROR when a student role is given a staff ID', async () => {
    const { createUser } = await import('../admin.service.js');
    await expect(
      createUser({ ...LECTURER_INPUT, role: Role.STUDENT }, 'admin-1', 'SUPER_ADMIN'),
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
});

// ── importUsers (Phase 10 — regression) ──────────────────────────────────────

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
      expect.any(String),
      expect.stringMatching(/^imports\//),
      csvBuffer,
      'text/csv',
    );
    expect(result.jobId).toBeDefined();
    expect(typeof result.jobId).toBe('string');
  });
});

// ── processBulkImport ─────────────────────────────────────────────────────────

describe('bulk-import.service — processBulkImport', () => {
  beforeEach(() => vi.clearAllMocks());

  /**
   * Builds a minimal valid CSV string for testing.
   *
   * @param rows - Array of row objects to include after the header.
   * @returns CSV string with header row.
   */
  function buildCsv(
    rows: Array<{
      identifier: string;
      fullName: string;
      email: string;
      phone: string;
      role: string;
      scopeId?: string;
    }>,
  ): string {
    const header = 'identifier,fullName,email,phone,role,scopeId';
    const lines = rows.map(
      (r) => `${r.identifier},${r.fullName},${r.email},${r.phone},${r.role},${r.scopeId ?? ''}`,
    );
    return [header, ...lines].join('\n');
  }

  it('creates all accounts when CSV is valid', async () => {
    const { s3Client } = await import('../../../lib/s3.js');
    const { prisma } = await import('../../../lib/prisma.js');

    const csv = buildCsv([
      {
        identifier: 'KWASU/LEC/CSC/00301',
        fullName: 'Lecturer One',
        email: 'lec1@kwasu.edu.ng',
        phone: '+2348012345001',
        role: 'LECTURER',
      },
      {
        identifier: 'KWASU/LEC/CSC/00302',
        fullName: 'Lecturer Two',
        email: 'lec2@kwasu.edu.ng',
        phone: '+2348012345002',
        role: 'LECTURER',
      },
    ]);

    vi.mocked(s3Client.send).mockResolvedValueOnce({
      Body: { transformToString: async () => csv },
    } as never);

    vi.mocked(prisma.user.findUnique).mockResolvedValue(null); // no duplicates
    vi.mocked(prisma.user.create).mockResolvedValue({} as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

    const { processBulkImport } = await import('../bulk-import.service.js');
    const result = await processBulkImport('imports/test.csv', 'admin-1');

    expect(result.success).toBe(true);
    if (result.success && !('dryRun' in result)) {
      expect(result.created).toBe(2);
      expect(result.skipped).toBe(0);
    }
    expect(prisma.user.create).toHaveBeenCalledTimes(2);
  });

  it('returns row-level error for invalid matric number in row 3 and creates no accounts', async () => {
    const { s3Client } = await import('../../../lib/s3.js');
    const { prisma } = await import('../../../lib/prisma.js');

    const csv = buildCsv([
      {
        identifier: 'KWASU/LEC/CSC/00301',
        fullName: 'Lecturer One',
        email: 'lec1@kwasu.edu.ng',
        phone: '+2348012345001',
        role: 'LECTURER',
      },
      {
        identifier: 'KWASU/LEC/CSC/00302',
        fullName: 'Lecturer Two',
        email: 'lec2@kwasu.edu.ng',
        phone: '+2348012345002',
        role: 'LECTURER',
      },
      {
        identifier: 'INVALID-MATRIC-FORMAT',
        fullName: 'Bad Student',
        email: 'bad@kwasu.edu.ng',
        phone: '+2348012345003',
        role: 'STUDENT', // STUDENT role requires matric number format
      },
    ]);

    vi.mocked(s3Client.send).mockResolvedValueOnce({
      Body: { transformToString: async () => csv },
    } as never);

    const { processBulkImport } = await import('../bulk-import.service.js');
    const result = await processBulkImport('imports/test.csv', 'admin-1');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.row).toBe(3);
      expect(result.errors[0]!.field).toBe('identifier');
    }
    // No accounts should have been created
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('skips duplicate identifier and creates the rest', async () => {
    const { s3Client } = await import('../../../lib/s3.js');
    const { prisma } = await import('../../../lib/prisma.js');

    const csv = buildCsv([
      {
        identifier: 'KWASU/LEC/CSC/00301',
        fullName: 'Lecturer One',
        email: 'lec1@kwasu.edu.ng',
        phone: '+2348012345001',
        role: 'LECTURER',
      },
      {
        identifier: 'KWASU/LEC/CSC/00302',
        fullName: 'Lecturer Two (duplicate)',
        email: 'lec2@kwasu.edu.ng',
        phone: '+2348012345002',
        role: 'LECTURER',
      },
    ]);

    vi.mocked(s3Client.send).mockResolvedValueOnce({
      Body: { transformToString: async () => csv },
    } as never);

    // First identifier: not a duplicate. Second: duplicate.
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'existing-user' } as never);

    vi.mocked(prisma.user.create).mockResolvedValue({} as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

    const { processBulkImport } = await import('../bulk-import.service.js');
    const result = await processBulkImport('imports/test.csv', 'admin-1');

    expect(result.success).toBe(true);
    if (result.success && !('dryRun' in result)) {
      expect(result.created).toBe(1);
      expect(result.skipped).toBe(1);
    }
    expect(prisma.user.create).toHaveBeenCalledTimes(1);
  });

  it('returns dry-run preview without creating accounts', async () => {
    const { s3Client } = await import('../../../lib/s3.js');
    const { prisma } = await import('../../../lib/prisma.js');

    const csv = buildCsv([
      {
        identifier: 'KWASU/LEC/CSC/00301',
        fullName: 'Lecturer One',
        email: 'lec1@kwasu.edu.ng',
        phone: '+2348012345001',
        role: 'LECTURER',
      },
    ]);

    vi.mocked(s3Client.send).mockResolvedValueOnce({
      Body: { transformToString: async () => csv },
    } as never);

    vi.mocked(prisma.user.findMany).mockResolvedValueOnce([]); // no duplicates

    const { processBulkImport } = await import('../bulk-import.service.js');
    const result = await processBulkImport('imports/test.csv', 'admin-1', true);

    expect(result.success).toBe(true);
    if (result.success && 'dryRun' in result) {
      expect(result.dryRun).toBe(true);
      expect(result.wouldCreate).toBe(1);
      expect(result.wouldSkip).toBe(0);
    }
    expect(prisma.user.create).not.toHaveBeenCalled();
  });
});
