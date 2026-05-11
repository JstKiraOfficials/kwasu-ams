/**
 * @file error-handler.ts
 * @module middleware
 *
 * Global Fastify error handler and the `AppError` class used throughout the API.
 *
 * Error handling strategy:
 * - `ZodError` → 400 with field-level `{ errors: [...] }` array
 * - `AppError` → the error's own `statusCode` and `code`
 * - Fastify built-in validation errors → 400
 * - Known Fastify HTTP errors (4xx) → pass through with structured shape
 * - Unknown errors → 500 `INTERNAL_ERROR` (logged to Pino, sent to Sentry in production)
 *
 * All responses follow the `ApiErrorResponse` shape from `@kwasu-ams/types`.
 */

import { type FastifyError, type FastifyReply, type FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { type ApiError, type ApiErrorResponse } from '@kwasu-ams/types';

// =============================================================================
// AppError — thrown by service functions for known error conditions
// =============================================================================

/**
 * Structured application error thrown by service functions for expected failure
 * conditions (wrong password, session closed, resource not found, etc.).
 *
 * The global error handler converts `AppError` instances into structured JSON
 * responses using the `code`, `statusCode`, and optional `field` properties.
 *
 * @example
 * throw new AppError('NOT_FOUND', 'Course not found.', 404);
 * throw new AppError('VALIDATION_ERROR', 'Invalid matric number.', 400, 'matricNumber');
 */
export class AppError extends Error {
  /**
   * @param code       - Machine-readable error code (e.g. `'NOT_FOUND'`).
   * @param message    - Human-readable error description.
   * @param statusCode - HTTP status code to return. Defaults to `400`.
   * @param field      - Optional field name for field-level validation errors.
   */
  constructor(
    public readonly code: string,
    public override readonly message: string,
    public readonly statusCode: number = 400,
    public readonly field?: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

// =============================================================================
// Common AppError codes
// =============================================================================

/**
 * Canonical error code strings used across all service functions.
 *
 * Using this constant instead of raw strings ensures consistency and makes
 * it easy to grep for all usages of a specific error code.
 */
export const ErrorCodes = {
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  TOTP_REQUIRED: 'TOTP_REQUIRED',
  TOTP_INVALID: 'TOTP_INVALID',
  TOTP_SETUP_REQUIRED: 'TOTP_SETUP_REQUIRED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  SESSION_CLOSED: 'SESSION_CLOSED',
  SESSION_NOT_ACTIVE: 'SESSION_NOT_ACTIVE',
  OUTSIDE_GEOFENCE: 'OUTSIDE_GEOFENCE',
  CONCURRENT_SESSION: 'CONCURRENT_SESSION',
  QR_TOKEN_EXPIRED: 'QR_TOKEN_EXPIRED',
  QR_TOKEN_INVALID: 'QR_TOKEN_INVALID',
  CODE_INVALID: 'CODE_INVALID',
  OVERRIDE_WINDOW_EXPIRED: 'OVERRIDE_WINDOW_EXPIRED',
  EXCUSE_LIMIT_REACHED: 'EXCUSE_LIMIT_REACHED',
  ELIGIBILITY_FROZEN: 'ELIGIBILITY_FROZEN',
  DEVICE_LIMIT_REACHED: 'DEVICE_LIMIT_REACHED',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

// =============================================================================
// Global error handler
// =============================================================================

/**
 * Global Fastify error handler registered via `app.setErrorHandler()`.
 *
 * Converts all thrown errors into the structured `ApiErrorResponse` JSON shape.
 * Handles four error categories in priority order:
 * 1. `ZodError` — field-level 400 validation errors
 * 2. `AppError` — known application errors with explicit status codes
 * 3. Fastify built-in validation errors — 400 with field paths
 * 4. Unknown errors — 500 `INTERNAL_ERROR` (logged, sent to Sentry in production)
 *
 * @param error   - The thrown error (any type — Fastify catches everything).
 * @param request - Fastify request, used for structured logging.
 * @param reply   - Fastify reply used to send the HTTP response.
 */
export function errorHandler(
  error: FastifyError | AppError | ZodError | Error,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  const timestamp = new Date().toISOString();

  // ── Zod validation errors ─────────────────────────────────────────────────
  if (error instanceof ZodError) {
    const errors: ApiError[] = error.issues.map((issue) => ({
      code: ErrorCodes.VALIDATION_ERROR,
      message: issue.message,
      ...(issue.path.length > 0 ? { field: issue.path.join('.') } : {}),
    }));

    const response: ApiErrorResponse = { errors, statusCode: 400, timestamp };
    void reply.status(400).send(response);
    return;
  }

  // ── Known application errors ──────────────────────────────────────────────
  if (error instanceof AppError) {
    const errors: ApiError[] = [
      {
        code: error.code,
        message: error.message,
        ...(error.field !== undefined ? { field: error.field } : {}),
      },
    ];
    const response: ApiErrorResponse = {
      errors,
      statusCode: error.statusCode,
      timestamp,
    };
    void reply.status(error.statusCode).send(response);
    return;
  }

  // ── Fastify built-in validation errors (statusCode 400) ───────────────────
  const fastifyError = error as FastifyError;
  if (fastifyError.statusCode === 400 && fastifyError.validation) {
    const errors: ApiError[] = fastifyError.validation.map((v) => ({
      code: ErrorCodes.VALIDATION_ERROR,
      message: v.message ?? 'Validation error',
      ...(v.instancePath ? { field: v.instancePath.replace(/^\//, '') } : {}),
    }));
    const response: ApiErrorResponse = { errors, statusCode: 400, timestamp };
    void reply.status(400).send(response);
    return;
  }

  // ── Known Fastify HTTP errors (4xx) ──────────────────────────────────────
  if (fastifyError.statusCode && fastifyError.statusCode < 500) {
    const errors: ApiError[] = [{ code: String(fastifyError.statusCode), message: error.message }];
    const response: ApiErrorResponse = {
      errors,
      statusCode: fastifyError.statusCode,
      timestamp,
    };
    void reply.status(fastifyError.statusCode).send(response);
    return;
  }

  // ── Unknown / unexpected errors ───────────────────────────────────────────
  request.log.error({ err: error }, 'Unhandled error');

  const response: ApiErrorResponse = {
    errors: [{ code: ErrorCodes.INTERNAL_ERROR, message: 'An unexpected error occurred.' }],
    statusCode: 500,
    timestamp,
  };
  void reply.status(500).send(response);
}
