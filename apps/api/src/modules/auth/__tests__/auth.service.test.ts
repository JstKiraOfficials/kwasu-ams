/**
 * @file auth.service.test.ts
 * @module modules/auth/__tests__
 *
 * Unit tests for the auth service layer.
 *
 * All external dependencies (Prisma, Redis, Argon2, email) are mocked so
 * tests run without a real database or network connection.
 *
 * Coverage targets:
 * - login: happy path, format validation, wrong password, lockout, reset
 * - changePassword: happy path, wrong current password
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../../lib/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));

vi.mock('../../../lib/redis.js', () => ({
  redis: { get: vi.fn(), set: vi.fn(), del: vi.fn() },
  connectRedis: vi.fn(),
}));

vi.mock('../../../lib/argon2.js', () => ({
  verifyPassword: vi.fn(),
  hashPassword: vi.fn().mockResolvedValue('$argon2id$hashed'),
}));

vi.mock('../../../lib/email-client.js', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** A fully active student user with no failed attempts or lockout. */
const ACTIVE_STUDENT = {
  id: 'user-123',
  role: 'STUDENT',
  passwordHash: '$argon2id$hash',
  mustChangePassword: false,
  totpEnrolled: false,
  failedAttempts: 0,
  lockoutUntil: null,
  isActive: true,
};

// ── login ─────────────────────────────────────────────────────────────────────

describe('auth.service — login', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns interimToken for a valid matric number and correct password', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    const { verifyPassword } = await import('../../../lib/argon2.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(ACTIVE_STUDENT as never);
    vi.mocked(verifyPassword).mockResolvedValueOnce(true);
    vi.mocked(prisma.user.update).mockResolvedValueOnce({} as never);

    const { login } = await import('../auth.service.js');
    const result = await login('22/47CSC/00001', 'Password1!');

    expect(result.interimToken).toBeDefined();
    expect(typeof result.interimToken).toBe('string');
    expect(result.mustChangePassword).toBe(false);
    expect(result.totpEnrolled).toBe(false);
  });

  it('throws VALIDATION_ERROR for an invalid identifier format', async () => {
    const { login } = await import('../auth.service.js');
    await expect(login('not-valid', 'Password1!')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      field: 'identifier',
    });
  });

  it('throws INVALID_CREDENTIALS for a non-existent identifier', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);

    const { login } = await import('../auth.service.js');
    await expect(login('22/47CSC/00001', 'Password1!')).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
  });

  it('throws INVALID_CREDENTIALS for a wrong password', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    const { verifyPassword } = await import('../../../lib/argon2.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(ACTIVE_STUDENT as never);
    vi.mocked(verifyPassword).mockResolvedValueOnce(false);
    vi.mocked(prisma.user.update).mockResolvedValueOnce({} as never);

    const { login } = await import('../auth.service.js');
    await expect(login('22/47CSC/00001', 'WrongPass')).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
  });

  it('increments failedAttempts on each wrong password', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    const { verifyPassword } = await import('../../../lib/argon2.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(ACTIVE_STUDENT as never);
    vi.mocked(verifyPassword).mockResolvedValueOnce(false);
    vi.mocked(prisma.user.update).mockResolvedValueOnce({} as never);

    const { login } = await import('../auth.service.js');
    await expect(login('22/47CSC/00001', 'WrongPass')).rejects.toThrow();

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ failedAttempts: 1 }),
      }),
    );
  });

  it('sets lockoutUntil after the 5th consecutive failed attempt', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    const { verifyPassword } = await import('../../../lib/argon2.js');
    const userWith4Fails = { ...ACTIVE_STUDENT, failedAttempts: 4 };
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(userWith4Fails as never);
    vi.mocked(verifyPassword).mockResolvedValueOnce(false);
    vi.mocked(prisma.user.update).mockResolvedValueOnce({} as never);

    const { login } = await import('../auth.service.js');
    await expect(login('22/47CSC/00001', 'WrongPass')).rejects.toThrow();

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          failedAttempts: 5,
          lockoutUntil: expect.any(Date),
        }),
      }),
    );
  });

  it('throws ACCOUNT_LOCKED for a currently locked account', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    const lockedUser = {
      ...ACTIVE_STUDENT,
      lockoutUntil: new Date(Date.now() + 15 * 60 * 1000),
    };
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(lockedUser as never);

    const { login } = await import('../auth.service.js');
    await expect(login('22/47CSC/00001', 'Password1!')).rejects.toMatchObject({
      code: 'ACCOUNT_LOCKED',
    });
  });

  it('resets failedAttempts to 0 on a successful login', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    const { verifyPassword } = await import('../../../lib/argon2.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(ACTIVE_STUDENT as never);
    vi.mocked(verifyPassword).mockResolvedValueOnce(true);
    vi.mocked(prisma.user.update).mockResolvedValueOnce({} as never);

    const { login } = await import('../auth.service.js');
    await login('22/47CSC/00001', 'Password1!');

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ failedAttempts: 0, lockoutUntil: null }),
      }),
    );
  });
});

// ── changePassword ────────────────────────────────────────────────────────────

describe('auth.service — changePassword', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates the hash and sets mustChangePassword: false on success', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    const { verifyPassword } = await import('../../../lib/argon2.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: 'user-1',
      role: 'STUDENT',
      passwordHash: '$argon2id$old',
    } as never);
    vi.mocked(verifyPassword).mockResolvedValueOnce(true);
    vi.mocked(prisma.user.update).mockResolvedValueOnce({} as never);

    const { changePassword } = await import('../auth.service.js');
    await changePassword('user-1', 'OldPass1!', 'NewPass1!NewPass');

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          mustChangePassword: false,
          passwordHash: '$argon2id$hashed',
        }),
      }),
    );
  });

  it('throws INVALID_CREDENTIALS for a wrong current password', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    const { verifyPassword } = await import('../../../lib/argon2.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: 'user-1',
      role: 'STUDENT',
      passwordHash: '$argon2id$old',
    } as never);
    vi.mocked(verifyPassword).mockResolvedValueOnce(false);

    const { changePassword } = await import('../auth.service.js');
    await expect(changePassword('user-1', 'WrongOld', 'NewPass1!NewPass')).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
  });
});
