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
 * | Method | Path                    | Auth required          |
 * |--------|-------------------------|------------------------|
 * | POST   | /auth/login             | No                     |
 * | POST   | /auth/refresh           | No                     |
 * | POST   | /auth/forgot-password   | No                     |
 * | POST   | /auth/reset-password    | No                     |
 * | POST   | /auth/recover-totp      | No                     |
 * | POST   | /auth/change-password   | Yes (interim/access)   |
 * | POST   | /auth/logout            | Yes (access)           |
 * | POST   | /auth/setup-totp        | Yes (interim)          |
 * | POST   | /auth/confirm-totp      | Yes (interim)          |
 * | POST   | /auth/verify-totp       | Yes (interim)          |
 */

import { type FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate.js';
import * as controller from './auth.controller.js';

/**
 * Rate-limit configuration applied to every auth route.
 * Restricts each IP to 5 requests per minute to mitigate brute-force attacks.
 */
const AUTH_RATE_LIMIT = { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } };

/**
 * Shared Fastify JSON schema for request bodies that carry a single 6-digit
 * TOTP code. Reused by `/auth/confirm-totp` and `/auth/verify-totp`.
 */
const TOTP_CODE_BODY = {
  type: 'object',
  required: ['code'],
  properties: {
    code: {
      type: 'string',
      minLength: 6,
      maxLength: 6,
      pattern: '^\\d{6}$',
      description: '6-digit TOTP code from the authenticator app',
    },
  },
};

/**
 * Registers all authentication routes on the provided Fastify instance.
 *
 * Called from `app.ts` via `app.register(registerAuthRoutes)`.
 *
 * Covers the full authentication lifecycle:
 * - Password-based login → interim token
 * - TOTP setup (setup → confirm) and verification → full JWT pair
 * - TOTP recovery via backup code
 * - Password change and reset
 * - Token rotation and logout
 *
 * @param app - The Fastify application instance to register routes on.
 * @returns A promise that resolves once all routes have been registered.
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
          properties: {
            refreshToken: {
              type: 'string',
              description: 'Current refresh token (or sent via HttpOnly cookie)',
            },
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

  /**
   * POST /auth/recover-totp
   * Public endpoint. Authenticates a user via a single-use backup recovery code
   * when they cannot access their authenticator app. Issues a full JWT pair on
   * success and removes the used code from the stored hash list.
   */
  app.post(
    '/auth/recover-totp',
    {
      ...AUTH_RATE_LIMIT,
      schema: {
        tags: ['auth'],
        summary: 'Recover account access using a TOTP backup code',
        description:
          "Accepts the user's institutional identifier and one of their 8 single-use " +
          'backup recovery codes. On success, issues a full access + refresh token pair ' +
          'and permanently removes the used code. Returns a generic 401 on any failure ' +
          'to prevent enumeration.',
        body: {
          type: 'object',
          required: ['identifier', 'recoveryCode'],
          properties: {
            identifier: {
              type: 'string',
              description: 'Matric number or staff ID',
            },
            recoveryCode: {
              type: 'string',
              description: '8-character alphanumeric backup recovery code',
            },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              accessToken: { type: 'string', description: '30-minute access token' },
              refreshToken: { type: 'string', description: '7-day refresh token' },
            },
          },
        },
      },
    },
    controller.recoverTotpHandler,
  );

  // ── Protected routes (valid interim or access token required) ─────────────

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

  /**
   * POST /auth/setup-totp
   * Requires a valid interim token (issued by `POST /auth/login`).
   * Generates a new TOTP secret, stores it temporarily in Redis (10-minute TTL),
   * and returns the `otpauth://` URI for QR code rendering by the client.
   * Returns 409 if the user has already completed TOTP enrollment.
   */
  app.post(
    '/auth/setup-totp',
    {
      preHandler: [authenticate],
      ...AUTH_RATE_LIMIT,
      schema: {
        tags: ['auth'],
        summary: 'Begin TOTP enrollment — returns QR code URI',
        description:
          'Generates a TOTP secret and returns the `otpauth://totp/...` URI. ' +
          'The client renders the QR image from this URI using `qrcode.react` (web) ' +
          'or `react-native-qrcode-svg` (mobile). The plaintext secret is also returned ' +
          'as a manual entry fallback. The setup session expires after 10 minutes.',
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            properties: {
              secret: {
                type: 'string',
                description: 'Base32-encoded TOTP secret for manual entry in authenticator apps',
              },
              qrCodeUri: {
                type: 'string',
                description: 'otpauth:// URI — pass to QRCodeSVG value prop',
              },
            },
          },
        },
      },
    },
    controller.setupTotpHandler,
  );

  /**
   * POST /auth/confirm-totp
   * Requires a valid interim token.
   * Verifies the first TOTP code from the authenticator app, persists the
   * encrypted secret to the database, generates 8 single-use backup codes,
   * and marks the user as `totpEnrolled: true`. Backup codes are shown once.
   */
  app.post(
    '/auth/confirm-totp',
    {
      preHandler: [authenticate],
      ...AUTH_RATE_LIMIT,
      schema: {
        tags: ['auth'],
        summary: 'Confirm TOTP enrollment with first authenticator code',
        description:
          'Validates the 6-digit code against the pending setup secret in Redis. ' +
          'On success: encrypts and persists the secret, generates 8 backup codes ' +
          '(shown once — store them safely), and marks the account as TOTP-enrolled. ' +
          'Returns 400 TOTP_SETUP_REQUIRED if the 10-minute setup window has expired.',
        security: [{ bearerAuth: [] }],
        body: TOTP_CODE_BODY,
        response: {
          200: {
            type: 'object',
            properties: {
              backupCodes: {
                type: 'array',
                items: { type: 'string' },
                description: '8 single-use backup recovery codes — shown exactly once',
              },
              message: { type: 'string' },
            },
          },
        },
      },
    },
    controller.confirmTotpHandler,
  );

  /**
   * POST /auth/verify-totp
   * Requires a valid interim token (issued by `POST /auth/login`).
   * Validates the 6-digit TOTP code with ±1 step tolerance (90-second window),
   * enforces a used-token blacklist to prevent replay attacks, and issues the
   * full JWT access + refresh token pair on success.
   * Returns 403 TOTP_SETUP_REQUIRED if the user has not yet enrolled.
   */
  app.post(
    '/auth/verify-totp',
    {
      preHandler: [authenticate],
      ...AUTH_RATE_LIMIT,
      schema: {
        tags: ['auth'],
        summary: 'Verify TOTP code and receive full JWT token pair',
        description:
          'Completes the two-factor authentication step. Accepts the 6-digit code ' +
          "from the user's authenticator app. Uses ±1 step tolerance (90-second window) " +
          'to accommodate clock drift. Each code can only be used once (replay protection). ' +
          'Sets an HttpOnly `refreshToken` cookie in addition to the response body.',
        security: [{ bearerAuth: [] }],
        body: TOTP_CODE_BODY,
        response: {
          200: {
            type: 'object',
            properties: {
              accessToken: { type: 'string', description: '30-minute access token' },
              refreshToken: { type: 'string', description: '7-day refresh token' },
            },
          },
        },
      },
    },
    controller.verifyTotpHandler,
  );
}
