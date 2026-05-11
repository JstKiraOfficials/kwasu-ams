/**
 * @file s3.ts
 * @module config
 *
 * AWS S3 configuration derived from validated environment variables.
 * Consumed by `lib/s3.ts` to create the S3Client singleton and resolve bucket names.
 */

import { env } from './env.js';

/**
 * AWS S3 connection settings and bucket names read from the validated environment.
 * `buckets.excuses` stores excuse letter documents; `buckets.reports` stores
 * generated reports and eligibility certificates.
 */
export const s3Config = {
  region: env.AWS_REGION,
  accessKeyId: env.AWS_ACCESS_KEY_ID,
  secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  buckets: {
    excuses: env.AWS_S3_BUCKET_EXCUSES,
    reports: env.AWS_S3_BUCKET_REPORTS,
  },
} as const;
