/**
 * @file auth.controller.ts
 * @module modules/auth
 *
 * Thin HTTP controller layer for the auth module.
 *
 * Each handler:
 * 1. Parses and validates the request body through the appropriate Zod schema
 *    (validation errors are caught by the global error handler and returned as
 *    structured 400 responses).
 * 2. Delegates all business logic to {@link module:modules/auth/auth.service}.
 * 3. Sends the HTTP response with the correct status code.
 *
 * Controllers must contain no business logic — they are pure request/response
 * adapters between Fastify and the service layer.
 */

import { type FastifyReply, type FastifyRequest } from 'fastify';
import {
  LoginSchema,
  ChangePasswordSchema,
  ForgotPasswordSchema,
  RefreshTokenSchema,
  ResetPasswordSchema,
  VerifyTotpSchema,
  RecoverTotpSchema,
} from './auth.schema.js';
import * as authService from './auth.service.js';
import * as totpService from './totp.service.js';
import { env } from '../../config/env.js';

/**
 * Handles `POST /auth/login`.
 *
 * Validates the request body, delegates to {@link authService.login}, and
 * returns a 200 response containing the interim token and account-state flags.
 *
 * @param request - Fastify request containing `{ identifier, password }` body.
 * @param reply   - Fastify reply used to send the HTTP response.
 */
export async function loginHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const body = LoginSchema.parse(request.body);
  const result = await authService.login(body.identifier, body.password);
  void reply.status(200).send(result);
}

/**
 * Handles `POST /auth/refresh`.
 *
 * Reads the refresh token from the request body or, if absent, from the
 * `refreshToken` HttpOnly cookie set by the web client. Rotates the token
 * pair via {@link authService.refreshToken} and returns the new tokens.
 *
 * @param request - Fastify request. Refresh token may be in body or cookie.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @throws {AppError} 401 if no refresh token is found or the token is invalid.
 */
export async function refreshTokenHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  // Accept token from body (mobile/Postman) or HttpOnly cookie (web)
  const body = request.body as { refreshToken?: string } | null;
  const tokenFromBody = body?.refreshToken;
  const tokenFromCookie = (request.cookies as Record<string, string | undefined>)?.['refreshToken'];
  const refreshToken = tokenFromBody ?? tokenFromCookie;

  if (!refreshToken) {
    void reply
      .status(401)
      .send({ statusCode: 401, error: 'UNAUTHORIZED', message: 'Refresh token missing.' });
    return;
  }

  const result = await authService.refreshToken(refreshToken);
  void reply.status(200).send(result);
}

/**
 * Handles `POST /auth/change-password`.
 *
 * Requires a valid access token (`authenticate` preHandler must run first).
 * Validates the body, delegates to {@link authService.changePassword}, and
 * returns a 200 success message.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 *                  Body: `{ currentPassword, newPassword }`.
 * @param reply   - Fastify reply used to send the HTTP response.
 */
export async function changePasswordHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const body = ChangePasswordSchema.parse(request.body);
  await authService.changePassword(request.user!.userId, body.currentPassword, body.newPassword);
  void reply.status(200).send({ message: 'Password changed successfully.' });
}

/**
 * Handles `POST /auth/forgot-password`.
 *
 * Always returns a 200 response regardless of whether the account exists,
 * preventing user enumeration. Delegates to {@link authService.forgotPassword}.
 *
 * @param request - Fastify request containing `{ identifier, email }` body.
 * @param reply   - Fastify reply used to send the HTTP response.
 */
export async function forgotPasswordHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const body = ForgotPasswordSchema.parse(request.body);
  await authService.forgotPassword(body.identifier, body.email);
  void reply.status(200).send({ message: 'If the account exists, a reset link has been sent.' });
}

/**
 * Handles `POST /auth/reset-password`.
 *
 * Validates the single-use reset token and new password, delegates to
 * {@link authService.resetPassword}, and returns a 200 success message.
 *
 * @param request - Fastify request containing `{ resetToken, newPassword }` body.
 * @param reply   - Fastify reply used to send the HTTP response.
 */
export async function resetPasswordHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const body = ResetPasswordSchema.parse(request.body);
  await authService.resetPassword(body.resetToken, body.newPassword);
  void reply.status(200).send({ message: 'Password reset successfully.' });
}

/**
 * Handles `POST /auth/logout`.
 *
 * Requires a valid access token (`authenticate` preHandler must run first).
 * Optionally accepts a `refreshToken` in the body to blocklist it.
 * Delegates to {@link authService.logout} and returns a 200 success message.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 *                  Optional body: `{ refreshToken }`.
 * @param reply   - Fastify reply used to send the HTTP response.
 */
export async function logoutHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const body = request.body as { refreshToken?: string } | null;
  await authService.logout(request.user!.userId, request.user!.role, body?.refreshToken);
  void reply.status(200).send({ message: 'Logged out successfully.' });
}

/**
 * Handles `POST /auth/setup-totp`.
 *
 * Requires a valid interim token (`authenticate` preHandler must run first).
 * Generates a new TOTP secret, stores it in Redis with a 10-minute TTL, and
 * returns the `otpauth://` URI for QR code rendering plus the raw base32 secret
 * for manual entry. Returns 409 if the user is already enrolled.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @throws {AppError} `CONFLICT` (409) — user has already completed TOTP enrollment.
 * @throws {AppError} `NOT_FOUND` (404) — user record does not exist.
 */
export async function setupTotpHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const result = await totpService.setupTotp(request.user!.userId);
  void reply.status(200).send(result);
}

/**
 * Handles `POST /auth/confirm-totp`.
 *
 * Requires a valid interim token (`authenticate` preHandler must run first).
 * Validates the first TOTP code against the pending secret in Redis, persists
 * the AES-256 encrypted secret to the database, generates 8 single-use backup
 * codes (returned in plaintext exactly once), and marks the user as enrolled.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 *                  Body: `{ code: string }` — 6-digit TOTP code.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @throws {AppError} `TOTP_INVALID` (400) — code is incorrect.
 * @throws {AppError} `TOTP_SETUP_REQUIRED` (400) — Redis setup session has expired.
 */
export async function confirmTotpHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const body = VerifyTotpSchema.parse(request.body);
  const result = await totpService.confirmTotp(request.user!.userId, body.code);
  void reply.status(200).send({
    ...result,
    message:
      'TOTP enrollment complete. Store these backup codes safely — they will not be shown again.',
  });
}

/**
 * Handles `POST /auth/verify-totp`.
 *
 * Requires a valid interim token (`authenticate` preHandler must run first).
 * Validates the 6-digit TOTP code with ±1 step tolerance, enforces a
 * used-token blacklist to prevent replay attacks, and on success issues the
 * full JWT access + refresh token pair. The refresh token is set as an
 * HttpOnly cookie (web) and also returned in the response body (mobile).
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 *                  Body: `{ code: string }` — 6-digit TOTP code.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @throws {AppError} `TOTP_INVALID` (400) — code is incorrect or already used.
 * @throws {AppError} `TOTP_SETUP_REQUIRED` (403) — user has not yet enrolled TOTP.
 * @throws {AppError} `NOT_FOUND` (404) — user record does not exist.
 */
export async function verifyTotpHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const body = VerifyTotpSchema.parse(request.body);
  const result = await totpService.verifyTotp(request.user!.userId, body.code);

  // Set HttpOnly cookie for web clients; mobile clients use the response body value.
  reply.header(
    'Set-Cookie',
    `refreshToken=${result.refreshToken}; HttpOnly; SameSite=Strict; Path=/auth/refresh; Max-Age=604800${env.NODE_ENV === 'production' ? '; Secure' : ''}`,
  );
  void reply.status(200).send(result);
}

/**
 * Handles `POST /auth/recover-totp`.
 *
 * Public endpoint — no authentication required.
 * Authenticates a user via a single-use backup recovery code when they cannot
 * access their authenticator app. On success, issues a full JWT pair and sets
 * the refresh token as an HttpOnly cookie. The used code is permanently removed
 * from the stored hash list.
 *
 * @param request - Fastify request containing `{ identifier, recoveryCode }` body.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @throws {AppError} `VALIDATION_ERROR` (400) — identifier format is invalid.
 * @throws {AppError} `INVALID_CREDENTIALS` (401) — identifier not found or code is wrong.
 */
export async function recoverTotpHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const body = RecoverTotpSchema.parse(request.body);
  const result = await totpService.recoverTotp(body.identifier, body.recoveryCode);

  // Set HttpOnly cookie for web clients; mobile clients use the response body value.
  reply.header(
    'Set-Cookie',
    `refreshToken=${result.refreshToken}; HttpOnly; SameSite=Strict; Path=/auth/refresh; Max-Age=604800${env.NODE_ENV === 'production' ? '; Secure' : ''}`,
  );
  void reply.status(200).send(result);
}
