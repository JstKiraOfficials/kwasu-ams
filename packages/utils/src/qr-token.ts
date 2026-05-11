import jwt from 'jsonwebtoken';
import { err, ok, type Result } from './result.js';

export interface QrTokenPayload {
  sessionId: string;
  venueId: string;
  issuedAt: number; // Unix timestamp (seconds)
  expiresAt: number; // Unix timestamp (seconds)
}

/** Default QR token expiry in seconds (10 minutes). */
export const QR_TOKEN_EXPIRY_SECONDS: number = 600;

/**
 * Signs a QR token payload as a HS256 JWT.
 * The token is stored in CourseSession.qrToken and invalidated in Redis on regeneration.
 */
export function generateQrToken(payload: QrTokenPayload, secret: string): Result<string, string> {
  try {
    const token = jwt.sign(
      {
        sessionId: payload.sessionId,
        venueId: payload.venueId,
        issuedAt: payload.issuedAt,
      },
      secret,
      {
        algorithm: 'HS256',
        expiresIn: payload.expiresAt - Math.floor(Date.now() / 1000),
      },
    );
    return ok(token);
  } catch (e) {
    return err(e instanceof Error ? e.message : 'Failed to generate QR token');
  }
}

/**
 * Verifies a QR token JWT signature and expiry.
 * Returns ok(payload) if valid, err('TOKEN_EXPIRED') if expired,
 * err('TOKEN_INVALID') if signature is invalid or token is malformed.
 */
export function verifyQrToken(token: string, secret: string): Result<QrTokenPayload, string> {
  try {
    const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] }) as jwt.JwtPayload;

    return ok({
      sessionId: decoded['sessionId'] as string,
      venueId: decoded['venueId'] as string,
      issuedAt: decoded['issuedAt'] as number,
      expiresAt: decoded['exp'] as number,
    });
  } catch (e) {
    if (e instanceof jwt.TokenExpiredError) {
      return err('TOKEN_EXPIRED');
    }
    return err('TOKEN_INVALID');
  }
}
