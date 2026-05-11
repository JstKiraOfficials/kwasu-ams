import { z } from 'zod';

export const LoginSchema = z.object({
  identifier: z.string().min(1, 'Identifier is required'),
  password: z.string().min(1, 'Password is required'),
});

export const VerifyTotpSchema = z.object({
  code: z
    .string()
    .length(6, 'TOTP code must be exactly 6 digits')
    .regex(/^\d{6}$/, 'TOTP code must contain only digits'),
});

export const SetupTotpConfirmSchema = z.object({
  code: z
    .string()
    .length(6, 'TOTP code must be exactly 6 digits')
    .regex(/^\d{6}$/, 'TOTP code must contain only digits'),
});

export const SetupTotpResponseSchema = z.object({
  secret: z.string(),
  qrCodeUri: z.string().url(),
});

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z
    .string()
    .min(12, 'Password must be at least 12 characters')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{12,}$/,
      'Password must contain at least 1 uppercase letter, 1 lowercase letter, 1 digit, and 1 special character (@$!%*?&)',
    ),
});

export const RecoverTotpSchema = z.object({
  identifier: z.string().min(1, 'Identifier is required'),
  recoveryCode: z.string().length(8, 'Recovery code must be exactly 8 characters'),
});

export const ForgotPasswordSchema = z.object({
  identifier: z.string().min(1, 'Identifier is required'),
  email: z.string().email('Invalid email address'),
});

export type LoginInput = z.infer<typeof LoginSchema>;
export type VerifyTotpInput = z.infer<typeof VerifyTotpSchema>;
export type SetupTotpConfirmInput = z.infer<typeof SetupTotpConfirmSchema>;
export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;
export type RecoverTotpInput = z.infer<typeof RecoverTotpSchema>;
export type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>;
