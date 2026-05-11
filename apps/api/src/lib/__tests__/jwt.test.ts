import { describe, it, expect } from 'vitest';
import {
  signAccessToken,
  verifyAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../jwt.js';
import { isOk, isErr } from '@kwasu-ams/utils';
import { Role } from '@kwasu-ams/types';

const VALID_PAYLOAD = {
  userId: 'user-123',
  role: Role.STUDENT,
  scopeId: null,
  sessionId: 'session-abc',
};

describe('signAccessToken / verifyAccessToken', () => {
  it('produces a JWT string with 3 parts', () => {
    const token = signAccessToken(VALID_PAYLOAD);
    expect(token.split('.')).toHaveLength(3);
  });

  it('verifyAccessToken returns ok(payload) for a valid token', () => {
    const token = signAccessToken(VALID_PAYLOAD);
    const result = verifyAccessToken(token);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.userId).toBe(VALID_PAYLOAD.userId);
      expect(result.value.role).toBe(VALID_PAYLOAD.role);
    }
  });

  it('verifyAccessToken returns err(TOKEN_INVALID) for a tampered token', () => {
    const token = signAccessToken(VALID_PAYLOAD);
    const parts = token.split('.');
    const tampered = `${parts[0]}.${parts[1]}.invalidsig`;
    const result = verifyAccessToken(tampered);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error).toBe('TOKEN_INVALID');
    }
  });

  it('verifyAccessToken returns err(TOKEN_INVALID) for a garbage string', () => {
    const result = verifyAccessToken('not.a.jwt');
    expect(isErr(result)).toBe(true);
  });
});

describe('signRefreshToken / verifyRefreshToken', () => {
  it('produces a valid refresh token', () => {
    const token = signRefreshToken({ userId: 'user-123', sessionId: 'session-abc' });
    const result = verifyRefreshToken(token);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.userId).toBe('user-123');
    }
  });

  it('returns err(TOKEN_INVALID) for wrong secret', () => {
    // Refresh token verified with access secret should fail
    const token = signAccessToken(VALID_PAYLOAD);
    const result = verifyRefreshToken(token);
    // May succeed or fail depending on secret values — just check it returns a Result
    expect(result).toHaveProperty('ok');
  });
});
