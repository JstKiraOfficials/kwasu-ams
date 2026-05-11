/**
 * @file firebase.ts
 * @module config
 *
 * Firebase service account configuration derived from validated environment variables.
 * The `privateKey` field has escaped newlines replaced so the PEM block is valid.
 * Consumed by `lib/firebase.ts` to initialise the Firebase Admin SDK.
 */

import { env } from './env.js';

/**
 * Firebase Admin SDK credentials read from the validated environment.
 * `privateKey` has `\\n` sequences replaced with real newlines for PEM compatibility.
 */
export const firebaseConfig = {
  projectId: env.FIREBASE_PROJECT_ID,
  clientEmail: env.FIREBASE_CLIENT_EMAIL,
  // Replace escaped newlines from environment variable
  privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
} as const;
