import { randomBytes } from 'crypto';
import {
  ALPHANUMERIC_CHARSET,
  ALPHANUMERIC_CODE_MAX_LENGTH,
  ALPHANUMERIC_CODE_MIN_LENGTH,
} from './constants/alphanumeric-charset.js';
import { err, ok, type Result } from './result.js';

/**
 * Generates a cryptographically random alphanumeric code of the specified length.
 * Characters are drawn from ALPHANUMERIC_CHARSET (31 chars — excludes O, I, S, 0, 1).
 */
export function generateAlphanumericCode(length: number = 6): Result<string, string> {
  if (length < ALPHANUMERIC_CODE_MIN_LENGTH || length > ALPHANUMERIC_CODE_MAX_LENGTH) {
    return err(
      `Invalid length: ${length}. Must be between ${ALPHANUMERIC_CODE_MIN_LENGTH} and ${ALPHANUMERIC_CODE_MAX_LENGTH}.`,
    );
  }

  const bytes = randomBytes(length);
  let code = '';
  for (let i = 0; i < length; i++) {
    // Modulo bias is negligible for a 6–8 char classroom code (256 / 31 ≈ 8.26)
    code += ALPHANUMERIC_CHARSET[bytes[i]! % ALPHANUMERIC_CHARSET.length];
  }

  return ok(code);
}

/**
 * Returns true if the code is 6–8 characters and every character is in ALPHANUMERIC_CHARSET.
 */
export function validateAlphanumericCode(code: string): boolean {
  if (code.length < ALPHANUMERIC_CODE_MIN_LENGTH || code.length > ALPHANUMERIC_CODE_MAX_LENGTH) {
    return false;
  }
  for (const char of code) {
    if (!ALPHANUMERIC_CHARSET.includes(char)) return false;
  }
  return true;
}
