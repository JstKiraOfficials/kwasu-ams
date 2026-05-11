import { describe, it, expect } from 'vitest';
import {
  generateTotpSecret,
  encryptTotpSecret,
  decryptTotpSecret,
  generateBackupCodes,
  verifyBackupCode,
  verifyTotpCode,
} from '../totp.js';

describe('generateTotpSecret', () => {
  it('returns a secret and a URI', () => {
    const { secret, uri } = generateTotpSecret();
    expect(typeof secret).toBe('string');
    expect(secret.length).toBeGreaterThan(0);
    expect(uri).toMatch(/^otpauth:\/\/totp\//);
  });

  it('generates different secrets on successive calls', () => {
    const a = generateTotpSecret();
    const b = generateTotpSecret();
    expect(a.secret).not.toBe(b.secret);
  });
});

describe('encryptTotpSecret / decryptTotpSecret', () => {
  it('round-trips correctly', () => {
    const { secret } = generateTotpSecret();
    const encrypted = encryptTotpSecret(secret);
    expect(encrypted).toContain(':');
    const decrypted = decryptTotpSecret(encrypted);
    expect(decrypted).toBe(secret);
  });

  it('produces different ciphertext for the same secret (random IV)', () => {
    const { secret } = generateTotpSecret();
    const enc1 = encryptTotpSecret(secret);
    const enc2 = encryptTotpSecret(secret);
    expect(enc1).not.toBe(enc2);
  });
});

describe('generateBackupCodes', () => {
  it('returns 8 plaintext codes and 8 hashed codes', () => {
    const { plaintext, hashed } = generateBackupCodes();
    expect(plaintext).toHaveLength(8);
    expect(hashed).toHaveLength(8);
  });

  it('each plaintext code is 8 characters', () => {
    const { plaintext } = generateBackupCodes();
    for (const code of plaintext) {
      expect(code).toHaveLength(8);
    }
  });

  it('hashed codes are SHA-256 hex strings (64 chars)', () => {
    const { hashed } = generateBackupCodes();
    for (const hash of hashed) {
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]+$/);
    }
  });
});

describe('verifyBackupCode', () => {
  it('returns valid: true and removes the used code', () => {
    const { plaintext, hashed } = generateBackupCodes();
    const codeToUse = plaintext[0]!;
    const result = verifyBackupCode(codeToUse, hashed);
    expect(result.valid).toBe(true);
    expect(result.remainingCodes).toHaveLength(7);
    // The used hash should not be in remaining
    const { hashed: usedHashed } = generateBackupCodes();
    expect(result.remainingCodes).not.toContain(usedHashed[0]);
  });

  it('returns valid: false for an invalid code', () => {
    const { hashed } = generateBackupCodes();
    const result = verifyBackupCode('INVALID1', hashed);
    expect(result.valid).toBe(false);
    expect(result.remainingCodes).toHaveLength(8);
  });
});

describe('verifyTotpCode', () => {
  it('returns false for an obviously wrong code', () => {
    const { secret } = generateTotpSecret();
    expect(verifyTotpCode(secret, '000000')).toBe(false);
  });
});
