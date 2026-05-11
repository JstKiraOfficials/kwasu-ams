import { createHash } from 'crypto';

/**
 * Computes the SHA-256 hash of the given content.
 * Used for PDF checksums and backup code hashing.
 */
export function computeSha256(content: Buffer | string): string {
  return createHash('sha256').update(content).digest('hex');
}
