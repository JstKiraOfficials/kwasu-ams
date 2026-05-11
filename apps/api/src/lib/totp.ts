import * as OTPAuth from 'otpauth';
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';
import { env } from '../config/env.js';

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16; // AES block size
const BACKUP_CODE_LENGTH = 8;
const BACKUP_CODE_COUNT = 8;
const BACKUP_CODE_CHARSET = 'ABCDEFGHJKLMNPQRTUVWXYZ23456789';

/** Generates a new TOTP secret and the otpauth URI for QR code rendering. */
export function generateTotpSecret(): { secret: string; uri: string } {
  const totp = new OTPAuth.TOTP({
    issuer: env.TOTP_ISSUER,
    label: env.TOTP_ISSUER,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: new OTPAuth.Secret({ size: 20 }),
  });

  return {
    secret: totp.secret.base32,
    uri: totp.toString(),
  };
}

/**
 * Verifies a 6-digit TOTP code with ±1 step tolerance (90-second effective window).
 */
export function verifyTotpCode(secret: string, code: string): boolean {
  const totp = new OTPAuth.TOTP({
    issuer: env.TOTP_ISSUER,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });

  const delta = totp.validate({ token: code, window: 1 });
  return delta !== null;
}

/**
 * Encrypts a TOTP secret using AES-256-CBC.
 * Returns a hex string in the format: iv_hex:ciphertext_hex
 */
export function encryptTotpSecret(secret: string): string {
  const key = Buffer.from(env.TOTP_ENCRYPTION_KEY, 'hex');
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypts an AES-256-CBC encrypted TOTP secret.
 * Expects format: iv_hex:ciphertext_hex
 */
export function decryptTotpSecret(encrypted: string): string {
  const [ivHex, ciphertextHex] = encrypted.split(':');
  if (!ivHex || !ciphertextHex) {
    throw new Error('Invalid encrypted TOTP secret format');
  }
  const key = Buffer.from(env.TOTP_ENCRYPTION_KEY, 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

/** Generates 8 single-use backup recovery codes. Returns plaintext and SHA-256 hashes. */
export function generateBackupCodes(): { plaintext: string[]; hashed: string[] } {
  const plaintext: string[] = [];
  const hashed: string[] = [];

  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    const bytes = randomBytes(BACKUP_CODE_LENGTH);
    let code = '';
    for (let j = 0; j < BACKUP_CODE_LENGTH; j++) {
      code += BACKUP_CODE_CHARSET[bytes[j]! % BACKUP_CODE_CHARSET.length];
    }
    plaintext.push(code);
    hashed.push(createHash('sha256').update(code).digest('hex'));
  }

  return { plaintext, hashed };
}

/**
 * Verifies a submitted backup code against the stored hashes.
 * If valid, removes the used code from the remaining list.
 */
export function verifyBackupCode(
  submittedCode: string,
  hashedCodes: string[],
): { valid: boolean; remainingCodes: string[] } {
  const submittedHash = createHash('sha256').update(submittedCode).digest('hex');
  const index = hashedCodes.indexOf(submittedHash);

  if (index === -1) {
    return { valid: false, remainingCodes: hashedCodes };
  }

  const remainingCodes = [...hashedCodes.slice(0, index), ...hashedCodes.slice(index + 1)];
  return { valid: true, remainingCodes };
}
