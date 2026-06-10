import { describe, it, expect } from 'vitest';
import { generateQrToken, verifyQrToken, QR_TOKEN_EXPIRY_SECONDS } from './qr-token';
import { isOk, isErr } from './result';

const SECRET = 'test-secret-at-least-32-chars-long!!';
const NOW_SECONDS = Math.floor(Date.now() / 1000);

const VALID_PAYLOAD = {
  sessionId: 'session-abc-123',
  venueId: 'venue-xyz-456',
  issuedAt: NOW_SECONDS,
  expiresAt: NOW_SECONDS + QR_TOKEN_EXPIRY_SECONDS,
};

describe('generateQrToken', () => {
  it('produces a valid JWT string', () => {
    const result = generateQrToken(VALID_PAYLOAD, SECRET);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      // JWT has 3 dot-separated parts
      expect(result.value.split('.')).toHaveLength(3);
    }
  });
});

describe('verifyQrToken', () => {
  it('returns ok(payload) for a valid token', () => {
    const genResult = generateQrToken(VALID_PAYLOAD, SECRET);
    expect(isOk(genResult)).toBe(true);
    if (!isOk(genResult)) return;

    const verResult = verifyQrToken(genResult.value, SECRET);
    expect(isOk(verResult)).toBe(true);
    if (isOk(verResult)) {
      expect(verResult.value.sessionId).toBe(VALID_PAYLOAD.sessionId);
      expect(verResult.value.venueId).toBe(VALID_PAYLOAD.venueId);
    }
  });

  it('returns err(TOKEN_EXPIRED) for an expired token', () => {
    const expiredPayload = {
      ...VALID_PAYLOAD,
      expiresAt: NOW_SECONDS - 1, // already expired
    };
    const genResult = generateQrToken(expiredPayload, SECRET);
    expect(isOk(genResult)).toBe(true);
    if (!isOk(genResult)) return;

    const verResult = verifyQrToken(genResult.value, SECRET);
    expect(isErr(verResult)).toBe(true);
    if (isErr(verResult)) {
      expect(verResult.error).toBe('TOKEN_EXPIRED');
    }
  });

  it('returns err(TOKEN_INVALID) for a tampered token', () => {
    const genResult = generateQrToken(VALID_PAYLOAD, SECRET);
    expect(isOk(genResult)).toBe(true);
    if (!isOk(genResult)) return;

    // Tamper with the signature
    const parts = genResult.value.split('.');
    const tampered = `${parts[0]}.${parts[1]}.invalidsignature`;

    const verResult = verifyQrToken(tampered, SECRET);
    expect(isErr(verResult)).toBe(true);
    if (isErr(verResult)) {
      expect(verResult.error).toBe('TOKEN_INVALID');
    }
  });

  it('returns err(TOKEN_INVALID) for a token signed with a different secret', () => {
    const genResult = generateQrToken(VALID_PAYLOAD, SECRET);
    expect(isOk(genResult)).toBe(true);
    if (!isOk(genResult)) return;

    const verResult = verifyQrToken(genResult.value, 'wrong-secret');
    expect(isErr(verResult)).toBe(true);
    if (isErr(verResult)) {
      expect(verResult.error).toBe('TOKEN_INVALID');
    }
  });
});
