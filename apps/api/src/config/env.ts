import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

export const env = createEnv({
  server: {
    // Server
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_PORT: z.coerce.number().int().positive().default(3001),
    API_BASE_URL: z.string().url(),
    WEB_BASE_URL: z.string().url(),
    CORS_ORIGINS: z.string().min(1),

    // Database
    DATABASE_URL: z.string().min(1),
    DATABASE_DIRECT_URL: z.string().min(1),

    // Redis
    REDIS_URL: z.string().min(1),
    REDIS_PASSWORD: z.string().optional(),

    // JWT
    JWT_ACCESS_SECRET: z.string().min(64, 'JWT_ACCESS_SECRET must be at least 64 characters'),
    JWT_REFRESH_SECRET: z.string().min(64, 'JWT_REFRESH_SECRET must be at least 64 characters'),
    JWT_ACCESS_EXPIRES_IN: z.string().default('30m'),
    JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

    // TOTP
    TOTP_ENCRYPTION_KEY: z
      .string()
      .length(64, 'TOTP_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)'),
    TOTP_ISSUER: z.string().default('KWASU AMS'),

    // AWS S3
    AWS_REGION: z.string().min(1),
    AWS_ACCESS_KEY_ID: z.string().min(1),
    AWS_SECRET_ACCESS_KEY: z.string().min(1),
    AWS_S3_BUCKET_EXCUSES: z.string().min(1),
    AWS_S3_BUCKET_REPORTS: z.string().min(1),

    // Firebase
    FIREBASE_PROJECT_ID: z.string().min(1),
    FIREBASE_CLIENT_EMAIL: z.string().email(),
    FIREBASE_PRIVATE_KEY: z.string().min(1),

    // SMS
    SMS_PROVIDER: z.enum(['africastalking', 'termii']),
    AFRICASTALKING_API_KEY: z.string().optional(),
    AFRICASTALKING_USERNAME: z.string().optional(),
    TERMII_API_KEY: z.string().optional(),
    SMS_SENDER_ID: z.string().default('KWASU-AMS'),

    // Sentry
    SENTRY_DSN: z.string().url().optional(),
    SENTRY_ENVIRONMENT: z.string().optional(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
