/**
 * @file auth.routes.ts
 * @module modules/auth
 *
 * Fastify route registrations for the authentication module.
 *
 * All `/auth/*` routes carry a strict rate-limit override of 5 requests per
 * minute (vs the global 200/min) to mitigate brute-force attacks.
 *
 * Route summary:
 * | Method | Path                    | Auth required |
 * |--------|-------------------------|---------------|
 * | POST   | /auth/login             | No            |
 * | POST   | /auth/refresh           | No            |
 * | POST   | /auth/forgot-password   | No            |
 * | POST   | /auth/reset-password    | No            |
 * | POST   | /auth/change-password   | Yes (access)  |
 * | POST   | /auth/logout            | Yes (access)  |
 */

import { type FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate.js';
import * as controller from './auth.controller.js';

/** Rate-limit config applied to every auth route (5 req/min). */
const AUTH_RATE_LIMIT = { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } };

/**
 * Registers all authentication routes on the provided Fastify instance.
 *
 * Called from `app.ts` via `app.register(registerAuthRoutes)`.
 *
 * @param app - The Fastify application instance to register routes on.
 */
export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  // ── Public routes (no authentication required) ────────────────────────────

  /**
   * POST /auth/login
   * Validates identifier format, verifies Argon2id password, enforces lockout,
   * and returns a 5-minute interim token for the TOTP step.
   */
  app.post(
    '/auth/login',
    {
      ...AUTH_RATE_LIMIT,
      schema: {
        tags: ['auth'],
        summary: 'Login with institutional identifier and password',
        description:
          'Accepts a matric number (students) or staff ID (staff). Returns an interim ' +
          'token valid for 5 minutes, to be exchanged for a full token pair after TOTP ' +
          'verification (`POST /auth/verify-totp`).',
        body: {
          type: 'object',
          required: ['identifier', 'password'],
          properties: {
            identifier: {
              type: 'string',
              description:
                'Matric number (e.g. 22/47CSC/00001) or staff ID (e.g. KWASU/LEC/CSC/00134)',
            },
            password: { type: 'string', description: 'Account password' },
          },
        },
      },
    },
    controller.loginHandler,
  );

  /**
   * POST /auth/refresh
   * Rotates the refresh token pair. The old refresh token is blocklisted in Redis.
   */
  app.post(
    '/auth/refresh',
    {
      ...AUTH_RATE_LIMIT,
      schema: {
        tags: ['auth'],
        summary: 'Rotate access and refresh token pair',
        description:
          'Accepts the current refresh token and returns a new access token and ' +
          'refresh token. The old refresh token is immediately invalidated (single-use).',
        body: {
          type: 'object',
          required: ['refreshToken'],
          properties: {
            refreshToken: { type: 'string', description: 'Current refresh token' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              accessToken: { type: 'string', description: 'New 30-minute access token' },
              refreshToken: { type: 'string', description: 'New 7-day refresh token' },
            },
          },
        },
      },
    },
    controller.refreshTokenHandler,
  );

  /**
   * POST /auth/forgot-password
   * Sends a password reset link to the user's registered email.
   * Always returns 200 to prevent account enumeration.
   */
  app.post(
    '/auth/forgot-password',
    {
      ...AUTH_RATE_LIMIT,
      schema: {
        tags: ['auth'],
        summary: 'Request a password reset link',
        description:
          'Sends a single-use reset link to the registered email address. ' +
          'Always returns 200 regardless of whether the account exists.',
        body: {
          type: 'object',
          required: ['identifier', 'email'],
          properties: {
            identifier: { type: 'string', description: 'Matric number or staff ID' },
            email: { type: 'string', format: 'email', description: 'Registered email address' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: { message: { type: 'string' } },
          },
        },
      },
    },
    controller.forgotPasswordHandler,
  );

  /**
   * POST /auth/reset-password
   * Consumes the single-use reset token and updates the password.
   */
  app.post(
    '/auth/reset-password',
    {
      ...AUTH_RATE_LIMIT,
      schema: {
        tags: ['auth'],
        summary: 'Reset password using a single-use reset token',
        description:
          'Validates the JWT reset token from the email link, updates the password, ' +
          'and deletes the Redis key to prevent reuse.',
        body: {
          type: 'object',
          required: ['resetToken', 'newPassword'],
          properties: {
            resetToken: { type: 'string', description: 'Single-use JWT from the reset email link' },
            newPassword: {
              type: 'string',
              description: 'New password (min 12 chars, must include upper, lower, digit, special)',
            },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: { message: { type: 'string' } },
          },
        },
      },
    },
    controller.resetPasswordHandler,
  );

  // ── Protected routes (valid access token required) ────────────────────────

  /**
   * POST /auth/change-password
   * Requires a valid access token. Used for forced password change on first login
   * and voluntary password changes.
   */
  app.post(
    '/auth/change-password',
    {
      preHandler: [authenticate],
      ...AUTH_RATE_LIMIT,
      schema: {
        tags: ['auth'],
        summary: 'Change password (requires authentication)',
        description:
          'Verifies the current password before updating to the new one. ' +
          'Sets `mustChangePassword = false` on success.',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['currentPassword', 'newPassword'],
          properties: {
            currentPassword: { type: 'string', description: 'Current account password' },
            newPassword: {
              type: 'string',
              description: 'New password (min 12 chars, must include upper, lower, digit, special)',
            },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: { message: { type: 'string' } },
          },
        },
      },
    },
    controller.changePasswordHandler,
  );

  /**
   * POST /auth/logout
   * Requires a valid access token. Blocklists the provided refresh token in Redis.
   */
  app.post(
    '/auth/logout',
    {
      preHandler: [authenticate],
      schema: {
        tags: ['auth'],
        summary: 'Logout and invalidate refresh token',
        description:
          'Adds the provided refresh token to the Redis blocklist for its remaining ' +
          'lifetime, preventing reuse. The access token expires naturally.',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          properties: {
            refreshToken: { type: 'string', description: 'Refresh token to invalidate (optional)' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: { message: { type: 'string' } },
          },
        },
      },
    },
    controller.logoutHandler,
  );
}
