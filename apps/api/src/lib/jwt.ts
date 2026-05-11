import jwt from 'jsonwebtoken';
import { type Result, ok, err } from '@kwasu-ams/utils';
import { type Role } from '@kwasu-ams/types';
import { env } from '../config/env.js';

export interface JwtAccessPayload {
  userId: string;
  role: Role;
  scopeId: string | null;
  sessionId: string;
  iat?: number;
  exp?: number;
}

export interface JwtRefreshPayload {
  userId: string;
  sessionId: string;
  iat?: number;
  exp?: number;
}

export interface JwtInterimPayload {
  userId: string;
  iat?: number;
  exp?: number;
}

/** Signs a short-lived access token (30 minutes). */
export function signAccessToken(payload: Omit<JwtAccessPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    algorithm: 'HS256',
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
  } as jwt.SignOptions);
}

/** Signs a long-lived refresh token (7 days). */
export function signRefreshToken(payload: Omit<JwtRefreshPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    algorithm: 'HS256',
    expiresIn: env.JWT_REFRESH_EXPIRES_IN,
  } as jwt.SignOptions);
}

/**
 * Signs a short-lived interim token (5 minutes).
 * Issued after password verification, before TOTP verification.
 */
export function signInterimToken(payload: Omit<JwtInterimPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    algorithm: 'HS256',
    expiresIn: '5m',
  } as jwt.SignOptions);
}

/** Verifies an access token. Returns ok(payload) or err with reason. */
export function verifyAccessToken(
  token: string,
): Result<JwtAccessPayload, 'TOKEN_EXPIRED' | 'TOKEN_INVALID'> {
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      algorithms: ['HS256'],
    }) as JwtAccessPayload;
    return ok(payload);
  } catch (e) {
    if (e instanceof jwt.TokenExpiredError) return err('TOKEN_EXPIRED');
    return err('TOKEN_INVALID');
  }
}

/** Verifies a refresh token. Returns ok(payload) or err with reason. */
export function verifyRefreshToken(
  token: string,
): Result<JwtRefreshPayload, 'TOKEN_EXPIRED' | 'TOKEN_INVALID'> {
  try {
    const payload = jwt.verify(token, env.JWT_REFRESH_SECRET, {
      algorithms: ['HS256'],
    }) as JwtRefreshPayload;
    return ok(payload);
  } catch (e) {
    if (e instanceof jwt.TokenExpiredError) return err('TOKEN_EXPIRED');
    return err('TOKEN_INVALID');
  }
}

/** Verifies an interim token (uses access secret). */
export function verifyInterimToken(
  token: string,
): Result<JwtInterimPayload, 'TOKEN_EXPIRED' | 'TOKEN_INVALID'> {
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      algorithms: ['HS256'],
    }) as JwtInterimPayload;
    return ok(payload);
  } catch (e) {
    if (e instanceof jwt.TokenExpiredError) return err('TOKEN_EXPIRED');
    return err('TOKEN_INVALID');
  }
}
