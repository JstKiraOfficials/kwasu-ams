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
} from './auth.schema.js';
import * as authService from './auth.service.js';

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
 * Validates the refresh token in the request body, rotates the token pair via
 * {@link authService.refreshToken}, and returns the new tokens.
 *
 * @param request - Fastify request containing `{ refreshToken }` body.
 * @param reply   - Fastify reply used to send the HTTP response.
 */
export async function refreshTokenHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const body = RefreshTokenSchema.parse(request.body);
  const result = await authService.refreshToken(body.refreshToken);
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
