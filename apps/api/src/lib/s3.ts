import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { s3Config } from '../config/s3.js';

export const s3Client = new S3Client({
  region: s3Config.region,
  credentials: {
    accessKeyId: s3Config.accessKeyId,
    secretAccessKey: s3Config.secretAccessKey,
  },
});

/** Uploads a file to S3. */
export async function uploadToS3(
  bucket: string,
  key: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  await s3Client.send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }),
  );
}

/** Generates a pre-signed URL for downloading an S3 object. */
export async function getPresignedUrl(
  bucket: string,
  key: string,
  expiresInSeconds: number,
): Promise<string> {
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
}

/** Deletes an object from S3. */
export async function deleteFromS3(bucket: string, key: string): Promise<void> {
  await s3Client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

/** Returns `true` if the given S3 key already exists (HEAD request). */
export async function s3KeyExists(bucket: string, key: string): Promise<boolean> {
  try {
    await s3Client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}
