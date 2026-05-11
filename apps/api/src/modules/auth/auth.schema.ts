/**
 * @file auth.schema.ts
 * @module modules/auth
 *
 * Re-exports shared Zod validation schemas from `@kwasu-ams/types` for use
 * within the auth module, and defines module-local schemas not present in the
 * shared package (e.g. RefreshTokenSchema, ResetPasswordSchema).
 *
 * All schemas are the single source of truth for request body validation —
 * controllers parse incoming bodies through these schemas before calling
 * service methods.
 */

import { z } from 'zod';

export {
  LoginSchema,
  VerifyTotpSchema,
  ChangePasswordSchema,
  ForgotPasswordSchema,
  RecoverTotpSchema,
} from '@kwasu-ams/types';

/**
 * Schema for the `POST /auth/refresh` request body.
 * Validates that a non-empty refresh token string is present.
 */
export const RefreshTokenSchema = z.object({
  /** The refresh token issued at login or last token rotation. */
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

/**
 * Schema for the `POST /auth/reset-password` request body.
 * Validates the single-use reset token and enforces password complexity rules.
 */
export const ResetPasswordSchema = z.object({
  /** Single-use JWT reset token delivered via email link. */
  resetToken: z.string().min(1, 'Reset token is required'),
  /**
   * New password — must be ≥ 12 characters and contain at least one uppercase
   * letter, one lowercase letter, one digit, and one special character.
   */
  newPassword: z
    .string()
    .min(12, 'Password must be at least 12 characters')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{12,}$/,
      'Password must contain uppercase, lowercase, digit, and special character (@$!%*?&)',
    ),
});

/** Inferred TypeScript type for {@link RefreshTokenSchema}. */
export type RefreshTokenInput = z.infer<typeof RefreshTokenSchema>;

/** Inferred TypeScript type for {@link ResetPasswordSchema}. */
export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;
