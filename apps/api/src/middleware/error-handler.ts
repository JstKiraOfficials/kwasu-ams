import { type FastifyError, type FastifyReply, type FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { type ApiError, type ApiErrorResponse } from '@kwasu-ams/types';

// =============================================================================
// AppError — thrown by service functions for known error conditions
// =============================================================================

export class AppError extends Error {
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
