/**
 * @file users.service.test.ts
 * @module modules/users/__tests__
 *
 * Unit tests for the users service.
 *
 * All Prisma, pdf-generator, and email-client calls are mocked.
 *
 * Test coverage:
 * - getCurrentUser: returns IUserPublic without sensitive fields
 * - getCurrentUser: throws NOT_FOUND when user does not exist
 * - updateProfile: updates allowed fields and writes AuditLog
 * - updateProfile: throws NOT_FOUND when user does not exist
 * - requestDataExport: sends email and writes DATA_EXPORT_REQUESTED AuditLog
 * - getAccessLog: returns paginated entries for the user's own data
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Mocks
// =============================================================================

vi.mock('../../../lib/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    attendanceRecord: { findMany: vi.fn() },
    excuseLetter: { findMany: vi.fn() },
    examEligibility: { findMany: vi.fn() },
    notification: { findMany: vi.fn() },
    supportTicket: { findMany: vi.fn() },
    auditLog: { create: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  },
}));

vi.mock('../../../lib/pdf-generator.js', () => ({
  generatePdf: vi.fn().mockResolvedValue({ buffer: Buffer.from('pdf'), checksum: 'abc123' }),
}));

vi.mock('../../../lib/email-client.js', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));

// =============================================================================
// Imports (after mocks)
// =============================================================================

import {
  getCurrentUser,
  updateProfile,
  requestDataExport,
  getAccessLog,
} from '../users.service.js';
import { prisma } from '../../../lib/prisma.js';
import { sendEmail } from '../../../lib/email-client.js';
import { generatePdf } from '../../../lib/pdf-generator.js';

// =============================================================================
// Fixtures
// =============================================================================

const USER_ID = 'a0000000-0000-4000-8000-000000000001';

const makeUser = (overrides: Record<string, unknown> = {}) => ({
  id: USER_ID,
  identifier: '22/47CSC/00001',
  fullName: 'Test User',
  email: 'test@kwasu.edu.ng',
  phone: '08012345678',
  role: 'STUDENT',
  scopeId: null,
  languagePreference: 'en',
  isActive: true,
  totpEnrolled: true,
  mustChangePassword: false,
  createdAt: new Date('2025-01-01'),
  // Sensitive fields — must be stripped in output
  passwordHash: '$argon2id$hashed',
  totpSecret: 'TOPSECRET',
  totpBackupCodes: ['code1', 'code2'],
  failedAttempts: 0,
  lockoutUntil: null,
  deletedAt: null,
  student: null,
  lecturer: null,
  ...overrides,
});

// =============================================================================
// getCurrentUser
// =============================================================================

describe('getCurrentUser', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns IUserPublic without sensitive fields', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(makeUser() as never);

    const result = await getCurrentUser(USER_ID);

    expect(result.id).toBe(USER_ID);
    expect(result.fullName).toBe('Test User');
    expect((result as Record<string, unknown>)['passwordHash']).toBeUndefined();
    expect((result as Record<string, unknown>)['totpSecret']).toBeUndefined();
    expect((result as Record<string, unknown>)['totpBackupCodes']).toBeUndefined();
    expect((result as Record<string, unknown>)['failedAttempts']).toBeUndefined();
    expect((result as Record<string, unknown>)['lockoutUntil']).toBeUndefined();
  });

  it('throws NOT_FOUND when user does not exist', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);

    await expect(getCurrentUser(USER_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
      statusCode: 404,
    });
  });
});

// =============================================================================
// updateProfile
// =============================================================================

describe('updateProfile', () => {
  beforeEach(() => vi.resetAllMocks());

  it('updates allowed fields and writes AuditLog', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({ id: USER_ID } as never);
    vi.mocked(prisma.user.update).mockResolvedValueOnce(
      makeUser({ email: 'new@kwasu.edu.ng' }) as never,
    );
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

    const result = await updateProfile(USER_ID, { email: 'new@kwasu.edu.ng' });

    expect(result.email).toBe('new@kwasu.edu.ng');
    expect((result as Record<string, unknown>)['passwordHash']).toBeUndefined();
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: USER_ID }, data: { email: 'new@kwasu.edu.ng' } }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'USER_UPDATED' }) }),
    );
  });

  it('throws NOT_FOUND when user does not exist', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);

    await expect(updateProfile(USER_ID, { phone: '08000000000' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      statusCode: 404,
    });
  });
});

// =============================================================================
// requestDataExport
// =============================================================================

describe('requestDataExport', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(generatePdf).mockResolvedValue({ buffer: Buffer.from('pdf'), checksum: 'abc123' });
    vi.mocked(prisma.attendanceRecord.findMany).mockResolvedValue([]);
    vi.mocked(prisma.excuseLetter.findMany).mockResolvedValue([]);
    vi.mocked(prisma.examEligibility.findMany).mockResolvedValue([]);
    vi.mocked(prisma.notification.findMany).mockResolvedValue([]);
    vi.mocked(prisma.supportTicket.findMany).mockResolvedValue([]);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);
  });

  it('sends email to user and returns success message', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(makeUser() as never);

    const result = await requestDataExport(USER_ID);

    expect(result.message).toContain('email address');
    expect(sendEmail).toHaveBeenCalledWith(
      'test@kwasu.edu.ng',
      expect.stringContaining('Data Export'),
      expect.any(String),
    );
  });

  it('writes DATA_EXPORT_REQUESTED AuditLog entry', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(makeUser() as never);

    await requestDataExport(USER_ID);

    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'DATA_EXPORT_REQUESTED' }),
      }),
    );
  });

  it('throws NOT_FOUND when user does not exist', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);

    await expect(requestDataExport(USER_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
      statusCode: 404,
    });
  });
});

// =============================================================================
// getAccessLog
// =============================================================================

describe('getAccessLog', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns paginated access log entries for the user', async () => {
    vi.mocked(prisma.attendanceRecord.findMany).mockResolvedValueOnce([{ id: 'att-1' }] as never);
    vi.mocked(prisma.examEligibility.findMany).mockResolvedValueOnce([]);
    vi.mocked(prisma.excuseLetter.findMany).mockResolvedValueOnce([]);
    vi.mocked(prisma.auditLog.findMany).mockResolvedValueOnce([
      {
        id: 'log-1',
        actorRole: 'HOD',
        action: 'ATTENDANCE_MARKED',
        createdAt: new Date('2025-09-01'),
        entityType: 'AttendanceRecord',
      },
    ] as never);
    vi.mocked(prisma.auditLog.count).mockResolvedValueOnce(1);

    const result = await getAccessLog(USER_ID, { page: 1, pageSize: 20 });

    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.actorRole).toBe('HOD');
    expect(result.data[0]!.description).toContain('AttendanceRecord');
    expect(result.meta.total).toBe(1);
  });

  it('returns empty list when user has no tracked entities', async () => {
    vi.mocked(prisma.attendanceRecord.findMany).mockResolvedValueOnce([]);
    vi.mocked(prisma.examEligibility.findMany).mockResolvedValueOnce([]);
    vi.mocked(prisma.excuseLetter.findMany).mockResolvedValueOnce([]);
    vi.mocked(prisma.auditLog.findMany).mockResolvedValueOnce([]);
    vi.mocked(prisma.auditLog.count).mockResolvedValueOnce(0);

    const result = await getAccessLog(USER_ID, { page: 1, pageSize: 20 });

    expect(result.data).toHaveLength(0);
    expect(result.meta.total).toBe(0);
  });
});
