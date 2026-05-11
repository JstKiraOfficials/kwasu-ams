import { env } from './env.js';

export const s3Config = {
  region: env.AWS_REGION,
  accessKeyId: env.AWS_ACCESS_KEY_ID,
  secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  buckets: {
    excuses: env.AWS_S3_BUCKET_EXCUSES,
    reports: env.AWS_S3_BUCKET_REPORTS,
  },
} as const;
