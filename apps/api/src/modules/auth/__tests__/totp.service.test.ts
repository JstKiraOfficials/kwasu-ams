/**
 * @file totp.service.test.ts
 * @module modules/auth/__tests__
 *
 * Unit tests for the TOTP service layer.
 *
 * All external dependencies (Prisma, Redis, lib/totp, lib/jwt) are mocked so
 * tests run without a real database, Redis instance, or cryptographic operations.
 *
 * Coverage targets:
 * - setupTotp: unenrolled user, already-enrolled user
 * - confirmTotp: correct code, incorrect code, expired Redis key
 * - verifyTotp: correct code, replayed code, incorrect code, non-enrolled user, ±1 step window
 * - recoverTotp: valid backup code, invalid backup code, last backup code exhaustion
 * - adminResetTotp: clears TOTP fields, writes AuditLog
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../../lib/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));

vi.mock('../../../lib/redis.js', () => ({
  workerRedis: { on: vi.fn() },
  redis: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  },
  connectRedis: vi.fn(),
}));

vi.mock('../../../lib/totp.js', () => ({
  generateTotpSecret: vi.fn(),
  verifyTotpCode: vi.fn(),
  encryptTotpSecret: vi.fn(),
  decryptTotpSecret: vi.fn(),
  generateBackupCodes: vi.fn(),
  verifyBackupCode: vi.fn(),
}));

vi.mock('../../../lib/jwt.js', () => ({
  signAccessToken: vi.fn().mockReturnValue('mock-access-token'),
  signRefreshToken: vi.fn().mockReturnValue('mock-refresh-token'),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** Unenrolled user — has not yet completed TOTP setup. */
const UNENROLLED_USER = {
  id: 'user-123',
  role: 'STUDENT',
  scopeId: null,
  totpEnrolled: false,
  totpSecret: null,
  totpBackupCodes: [],
};

/** Enrolled user — has completed TOTP setup. */
const ENROLLED_USER = {
  id: 'user-456',
  role: 'LECTURER',
  scopeId: 'dept-1',
  totpEnrolled: true,
  totpSecret: 'iv:ciphertext',
  totpBackupCodes: ['hash1', 'hash2', 'hash3', 'hash4', 'hash5', 'hash6', 'hash7', 'hash8'],
};

// ── setupTotp ─────────────────────────────────────────────────────────────────

describe('totp.service — setupTotp', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns secret and qrCodeUri starting with otpauth://totp/ for an unenrolled user', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    const { redis } = await import('../../../lib/redis.js');
    const { generateTotpSecret } = await import('../../../lib/totp.js');

    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(UNENROLLED_USER as never);
    vi.mocked(generateTotpSecret).mockReturnValueOnce({
      secret: 'BASE32SECRET',
      uri: 'otpauth://totp/KWASU%20AMS:22%2F47CSC%2F00001?secret=BASE32SECRET&issuer=KWASU%20AMS',
    });
    vi.mocked(redis.set).mockResolvedValueOnce('OK');

    const { setupTotp } = await import('../totp.service.js');
    const result = await setupTotp('user-123');

    expect(result.secret).toBe('BASE32SECRET');
    expect(result.qrCodeUri).toMatch(/^otpauth:\/\/totp\//);
    expect(redis.set).toHaveBeenCalledWith('totp:setup:user-123', 'BASE32SECRET', 'EX', 600);
  });

  it('throws CONFLICT for an already-enrolled user', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(ENROLLED_USER as never);

    const { setupTotp } = await import('../totp.service.js');
    await expect(setupTotp('user-456')).rejects.toMatchObject({
      code: 'CONFLICT',
      statusCode: 409,
    });
  });

  it('throws NOT_FOUND when the user does not exist', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);

    const { setupTotp } = await import('../totp.service.js');
    await expect(setupTotp('nonexistent')).rejects.toMatchObject({
      code: 'NOT_FOUND',
      statusCode: 404,
    });
  });
});

// ── confirmTotp ───────────────────────────────────────────────────────────────

describe('totp.service — confirmTotp', () => {
  beforeEach(() => vi.clearAllMocks());

  it('encrypts secret, stores in DB, returns 8 plaintext backup codes, and deletes Redis key', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    const { redis } = await import('../../../lib/redis.js');
    const { verifyTotpCode, encryptTotpSecret, generateBackupCodes } =
      await import('../../../lib/totp.js');

    vi.mocked(redis.get).mockResolvedValueOnce('BASE32SECRET');
    vi.mocked(verifyTotpCode).mockReturnValueOnce(true);
    vi.mocked(encryptTotpSecret).mockReturnValueOnce('iv:encrypted');
    vi.mocked(generateBackupCodes).mockReturnValueOnce({
      plaintext: [
        'CODE1111',
        'CODE2222',
        'CODE3333',
        'CODE4444',
        'CODE5555',
        'CODE6666',
        'CODE7777',
        'CODE8888',
      ],
      hashed: ['hash1', 'hash2', 'hash3', 'hash4', 'hash5', 'hash6', 'hash7', 'hash8'],
    });
    vi.mocked(prisma.user.update).mockResolvedValueOnce({} as never);
    vi.mocked(redis.del).mockResolvedValueOnce(1);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({ role: 'STUDENT' } as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValueOnce({} as never);

    const { confirmTotp } = await import('../totp.service.js');
    const result = await confirmTotp('user-123', '123456');

    expect(result.backupCodes).toHaveLength(8);
    expect(result.backupCodes[0]).toBe('CODE1111');

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          totpSecret: 'iv:encrypted',
          totpEnrolled: true,
          totpBackupCodes: ['hash1', 'hash2', 'hash3', 'hash4', 'hash5', 'hash6', 'hash7', 'hash8'],
        }),
      }),
    );

    expect(redis.del).toHaveBeenCalledWith('totp:setup:user-123');
  });

  it('throws TOTP_INVALID for an incorrect code', async () => {
    const { redis } = await import('../../../lib/redis.js');
    const { verifyTotpCode } = await import('../../../lib/totp.js');

    vi.mocked(redis.get).mockResolvedValueOnce('BASE32SECRET');
    vi.mocked(verifyTotpCode).mockReturnValueOnce(false);

    const { confirmTotp } = await import('../totp.service.js');
    await expect(confirmTotp('user-123', '000000')).rejects.toMatchObject({
      code: 'TOTP_INVALID',
      statusCode: 400,
    });
  });

  it('throws TOTP_SETUP_REQUIRED when the Redis key has expired (null)', async () => {
    const { redis } = await import('../../../lib/redis.js');
    vi.mocked(redis.get).mockResolvedValueOnce(null);

    const { confirmTotp } = await import('../totp.service.js');
    await expect(confirmTotp('user-123', '123456')).rejects.toMatchObject({
      code: 'TOTP_SETUP_REQUIRED',
      statusCode: 400,
    });
  });
});

// ── verifyTotp ────────────────────────────────────────────────────────────────

describe('totp.service — verifyTotp', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns accessToken and refreshToken for a correct code', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    const { redis } = await import('../../../lib/redis.js');
    const { decryptTotpSecret, verifyTotpCode } = await import('../../../lib/totp.js');

    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(ENROLLED_USER as never);
    vi.mocked(redis.get).mockResolvedValueOnce(null); // not blacklisted
    vi.mocked(decryptTotpSecret).mockReturnValueOnce('BASE32SECRET');
    vi.mocked(verifyTotpCode).mockReturnValueOnce(true);
    vi.mocked(redis.set).mockResolvedValueOnce('OK');
    vi.mocked(prisma.auditLog.create).mockResolvedValueOnce({} as never);

    const { verifyTotp } = await import('../totp.service.js');
    const result = await verifyTotp('user-456', '123456');

    expect(result.accessToken).toBe('mock-access-token');
    expect(result.refreshToken).toBe('mock-refresh-token');
  });

  it('blacklists the used code in Redis with a 90-second TTL', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    const { redis } = await import('../../../lib/redis.js');
    const { decryptTotpSecret, verifyTotpCode } = await import('../../../lib/totp.js');

    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(ENROLLED_USER as never);
    vi.mocked(redis.get).mockResolvedValueOnce(null);
    vi.mocked(decryptTotpSecret).mockReturnValueOnce('BASE32SECRET');
    vi.mocked(verifyTotpCode).mockReturnValueOnce(true);
    vi.mocked(redis.set).mockResolvedValueOnce('OK');
    vi.mocked(prisma.auditLog.create).mockResolvedValueOnce({} as never);

    const { verifyTotp } = await import('../totp.service.js');
    await verifyTotp('user-456', '123456');

    expect(redis.set).toHaveBeenCalledWith('totp:used:user-456:123456', '1', 'EX', 90);
  });

  it('throws TOTP_INVALID for a replayed code already in the Redis blacklist', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    const { redis } = await import('../../../lib/redis.js');
    const { decryptTotpSecret } = await import('../../../lib/totp.js');

    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(ENROLLED_USER as never);
    vi.mocked(decryptTotpSecret).mockReturnValueOnce('BASE32SECRET');
    vi.mocked(redis.get).mockResolvedValueOnce('1'); // already blacklisted

    const { verifyTotp } = await import('../totp.service.js');
    await expect(verifyTotp('user-456', '123456')).rejects.toMatchObject({
      code: 'TOTP_INVALID',
      statusCode: 400,
    });
  });

  it('throws TOTP_INVALID for an incorrect code', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    const { redis } = await import('../../../lib/redis.js');
    const { decryptTotpSecret, verifyTotpCode } = await import('../../../lib/totp.js');

    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(ENROLLED_USER as never);
    vi.mocked(redis.get).mockResolvedValueOnce(null);
    vi.mocked(decryptTotpSecret).mockReturnValueOnce('BASE32SECRET');
    vi.mocked(verifyTotpCode).mockReturnValueOnce(false);

    const { verifyTotp } = await import('../totp.service.js');
    await expect(verifyTotp('user-456', '000000')).rejects.toMatchObject({
      code: 'TOTP_INVALID',
      statusCode: 400,
    });
  });

  it('throws TOTP_SETUP_REQUIRED for a non-enrolled user', async () => {
    const { prisma } = await import('../../../lib/prisma.js');

    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(UNENROLLED_USER as never);

    const { verifyTotp } = await import('../totp.service.js');
    await expect(verifyTotp('user-123', '123456')).rejects.toMatchObject({
      code: 'TOTP_SETUP_REQUIRED',
      statusCode: 403,
    });
  });

  it('throws NOT_FOUND when the user does not exist', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);

    const { verifyTotp } = await import('../totp.service.js');
    await expect(verifyTotp('nonexistent', '123456')).rejects.toMatchObject({
      code: 'NOT_FOUND',
      statusCode: 404,
    });
  });

  it('accepts a code from the ±1 step window (tolerance test)', async () => {
    // verifyTotpCode is mocked — returning true simulates the otpauth library
    // accepting a code from the previous or next 30-second window (window: 1).
    const { prisma } = await import('../../../lib/prisma.js');
    const { redis } = await import('../../../lib/redis.js');
    const { decryptTotpSecret, verifyTotpCode } = await import('../../../lib/totp.js');

    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(ENROLLED_USER as never);
    vi.mocked(redis.get).mockResolvedValueOnce(null);
    vi.mocked(decryptTotpSecret).mockReturnValueOnce('BASE32SECRET');
    // Simulate window acceptance — the real otpauth library returns non-null delta
    // for codes within ±1 step; our verifyTotpCode wrapper returns true in that case.
    vi.mocked(verifyTotpCode).mockReturnValueOnce(true);
    vi.mocked(redis.set).mockResolvedValueOnce('OK');
    vi.mocked(prisma.auditLog.create).mockResolvedValueOnce({} as never);

    const { verifyTotp } = await import('../totp.service.js');
    const result = await verifyTotp('user-456', '654321'); // previous-window code

    expect(result.accessToken).toBeDefined();
    expect(result.refreshToken).toBeDefined();
  });
});

// ── recoverTotp ───────────────────────────────────────────────────────────────

describe('totp.service — recoverTotp', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns tokens and removes the used code from totpBackupCodes', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    const { verifyBackupCode } = await import('../../../lib/totp.js');

    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      ...ENROLLED_USER,
      identifier: '22/47CSC/00001',
    } as never);
    vi.mocked(verifyBackupCode).mockReturnValueOnce({
      valid: true,
      remainingCodes: ['hash2', 'hash3', 'hash4', 'hash5', 'hash6', 'hash7', 'hash8'],
    });
    vi.mocked(prisma.user.update).mockResolvedValueOnce({} as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValueOnce({} as never);

    const { recoverTotp } = await import('../totp.service.js');
    const result = await recoverTotp('22/47CSC/00001', 'CODE1111');

    expect(result.accessToken).toBe('mock-access-token');
    expect(result.refreshToken).toBe('mock-refresh-token');

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          totpBackupCodes: ['hash2', 'hash3', 'hash4', 'hash5', 'hash6', 'hash7', 'hash8'],
        }),
      }),
    );
  });

  it('throws INVALID_CREDENTIALS for an invalid backup code', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    const { verifyBackupCode } = await import('../../../lib/totp.js');

    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(ENROLLED_USER as never);
    vi.mocked(verifyBackupCode).mockReturnValueOnce({
      valid: false,
      remainingCodes: ENROLLED_USER.totpBackupCodes,
    });

    const { recoverTotp } = await import('../totp.service.js');
    await expect(recoverTotp('22/47CSC/00001', 'BADCODE1')).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
      statusCode: 401,
    });
  });

  it('throws INVALID_CREDENTIALS for an already-used backup code (not in remaining list)', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    const { verifyBackupCode } = await import('../../../lib/totp.js');

    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(ENROLLED_USER as never);
    // verifyBackupCode returns valid: false when the hash is not found (already used)
    vi.mocked(verifyBackupCode).mockReturnValueOnce({
      valid: false,
      remainingCodes: ENROLLED_USER.totpBackupCodes,
    });

    const { recoverTotp } = await import('../totp.service.js');
    await expect(recoverTotp('22/47CSC/00001', 'USEDCODE')).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
      statusCode: 401,
    });
  });

  it('throws INVALID_CREDENTIALS for an invalid identifier format', async () => {
    const { recoverTotp } = await import('../totp.service.js');
    await expect(recoverTotp('not-valid-id', 'CODE1111')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
    });
  });

  it('throws INVALID_CREDENTIALS when the user is not found', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);

    const { recoverTotp } = await import('../totp.service.js');
    await expect(recoverTotp('22/47CSC/00001', 'CODE1111')).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
      statusCode: 401,
    });
  });

  it('includes backupCodesExhausted: true in AuditLog when the last code is used', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    const { verifyBackupCode } = await import('../../../lib/totp.js');

    const userWithOneCode = { ...ENROLLED_USER, totpBackupCodes: ['lasthash'] };
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(userWithOneCode as never);
    vi.mocked(verifyBackupCode).mockReturnValueOnce({
      valid: true,
      remainingCodes: [], // last code consumed
    });
    vi.mocked(prisma.user.update).mockResolvedValueOnce({} as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValueOnce({} as never);

    const { recoverTotp } = await import('../totp.service.js');
    await recoverTotp('22/47CSC/00001', 'LASTCODE');

    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({ backupCodesExhausted: true }),
        }),
      }),
    );
  });
});

// ── adminResetTotp ────────────────────────────────────────────────────────────

describe('totp.service — adminResetTotp', () => {
  beforeEach(() => vi.clearAllMocks());

  it('clears totpSecret, totpEnrolled, and totpBackupCodes', async () => {
    const { prisma } = await import('../../../lib/prisma.js');

    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(ENROLLED_USER as never);
    vi.mocked(prisma.user.update).mockResolvedValueOnce({} as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValueOnce({} as never);

    const { adminResetTotp } = await import('../totp.service.js');
    await adminResetTotp('user-456', 'admin-1');

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-456' },
        data: expect.objectContaining({
          totpSecret: null,
          totpEnrolled: false,
          totpBackupCodes: [],
        }),
      }),
    );
  });

  it('writes an AuditLog entry with action TOTP_RESET and resetBy metadata', async () => {
    const { prisma } = await import('../../../lib/prisma.js');

    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(ENROLLED_USER as never);
    vi.mocked(prisma.user.update).mockResolvedValueOnce({} as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValueOnce({} as never);

    const { adminResetTotp } = await import('../totp.service.js');
    await adminResetTotp('user-456', 'admin-1');

    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'TOTP_RESET',
          entityId: 'user-456',
          metadata: expect.objectContaining({ resetBy: 'admin-1' }),
        }),
      }),
    );
  });

  it('throws NOT_FOUND when the target user does not exist', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);

    const { adminResetTotp } = await import('../totp.service.js');
    await expect(adminResetTotp('nonexistent', 'admin-1')).rejects.toMatchObject({
      code: 'NOT_FOUND',
      statusCode: 404,
    });
  });
});
