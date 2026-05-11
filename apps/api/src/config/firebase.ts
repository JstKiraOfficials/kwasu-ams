import { env } from './env.js';

export const firebaseConfig = {
  projectId: env.FIREBASE_PROJECT_ID,
  clientEmail: env.FIREBASE_CLIENT_EMAIL,
  // Replace escaped newlines from environment variable
  privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
} as const;
