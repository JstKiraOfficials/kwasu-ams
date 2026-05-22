/**
 * @file setup.ts
 * @module __tests__
 *
 * Vitest global setup — injects test environment variables before any test module loads.
 * This runs before env.ts is imported, preventing t3-env validation failures.
 *
 * Also mocks BullMQ and firebase-admin globally so their constructors don't
 * attempt real connections when modules are imported transitively by tests.
 */

import { vi } from 'vitest';

// Mock BullMQ globally — must be done before any module that imports bullmq is loaded.
vi.mock('bullmq', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Queue: vi.fn().mockImplementation(function (this: any) {
    this.add = vi.fn().mockResolvedValue({});
    this.on = vi.fn();
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Worker: vi.fn().mockImplementation(function (this: any) {
    this.on = vi.fn();
  }),
}));

// Mock firebase-admin globally — prevents FCM from parsing the fake private key.
vi.mock('firebase-admin', () => ({
  default: {
    apps: [],
    initializeApp: vi.fn(),
    credential: { cert: vi.fn().mockReturnValue({}) },
    messaging: vi.fn().mockReturnValue({
      send: vi.fn().mockResolvedValue('message-id'),
    }),
  },
}));

// ── Server ────────────────────────────────────────────────────────────────
process.env['NODE_ENV'] = 'test';
process.env['API_PORT'] = '3001';
process.env['API_BASE_URL'] = 'http://localhost:3001';
process.env['WEB_BASE_URL'] = 'http://localhost:3000';
process.env['CORS_ORIGINS'] = 'http://localhost:3000';

// ── Database ──────────────────────────────────────────────────────────────
process.env['DATABASE_URL'] =
  'postgresql://kwasu_test:kwasu_test_password@localhost:5432/kwasu_ams_test';
process.env['DATABASE_DIRECT_URL'] =
  'postgresql://kwasu_test:kwasu_test_password@localhost:5432/kwasu_ams_test';

// ── Redis ─────────────────────────────────────────────────────────────────
process.env['REDIS_URL'] = 'redis://localhost:6379';

// ── JWT (64+ hex chars each, different values) ────────────────────────────
process.env['JWT_ACCESS_SECRET'] =
  '0000000000000000000000000000000000000000000000000000000000000001test_access_secret';
process.env['JWT_REFRESH_SECRET'] =
  '1111111111111111111111111111111111111111111111111111111111111111test_refresh_secret';
process.env['JWT_ACCESS_EXPIRES_IN'] = '30m';
process.env['JWT_REFRESH_EXPIRES_IN'] = '7d';

// ── TOTP (exactly 64 hex chars = 32 bytes) ────────────────────────────────
process.env['TOTP_ENCRYPTION_KEY'] =
  '0000000000000000000000000000000000000000000000000000000000000000';
process.env['TOTP_ISSUER'] = 'KWASU AMS Test';

// ── AWS S3 ────────────────────────────────────────────────────────────────
process.env['AWS_REGION'] = 'eu-west-1';
process.env['AWS_ACCESS_KEY_ID'] = 'test-access-key';
process.env['AWS_SECRET_ACCESS_KEY'] = 'test-secret-key';
process.env['AWS_S3_BUCKET_EXCUSES'] = 'kwasu-test-excuses';
process.env['AWS_S3_BUCKET_REPORTS'] = 'kwasu-test-reports';

// ── Firebase ──────────────────────────────────────────────────────────────
process.env['FIREBASE_PROJECT_ID'] = 'kwasu-test';
process.env['FIREBASE_CLIENT_EMAIL'] = 'test@kwasu-test.iam.gserviceaccount.com';
process.env['FIREBASE_PRIVATE_KEY'] =
  '-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----';

// ── SMS ───────────────────────────────────────────────────────────────────
process.env['SMS_PROVIDER'] = 'africastalking';
process.env['SMS_SENDER_ID'] = 'KWASU-AMS';
