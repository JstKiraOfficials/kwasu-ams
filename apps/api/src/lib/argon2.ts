import argon2 from 'argon2';

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 65536, // 64 MB — OWASP 2024 recommendation
  timeCost: 3,
  parallelism: 4,
};

/** Hashes a password using Argon2id. Never use bcrypt or MD5 for passwords. */
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

/** Verifies a password against an Argon2id hash. Returns true if they match. */
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}
