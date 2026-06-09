/**
 * @file firebase.ts
 * @module lib
 *
 * Firebase Admin SDK singleton initialisation for KWASU AMS.
 *
 * Initialises the Firebase app once using service account credentials from
 * `config/firebase.ts`. Guards against double-initialisation during hot reload.
 *
 * In development, if the private key is a placeholder (i.e. not a valid PEM
 * block), initialisation is skipped and `fcm` is `null`. All call sites must
 * guard against a null `fcm` before sending push notifications.
 *
 * Exports the FCM messaging instance used by the push notification service.
 */

import admin from 'firebase-admin';
import type { Messaging } from 'firebase-admin/messaging';
import { firebaseConfig } from '../config/firebase.js';

/**
 * Returns `true` when the private key looks like a valid PEM block.
 * A placeholder value (e.g. containing "placeholder") will return `false`.
 *
 * @param key - The raw private key string to validate.
 * @returns `true` if the key starts and ends with PEM markers, `false` otherwise.
 */
function isValidPemKey(key: string): boolean {
  const trimmed = key.trim();
  return (
    (trimmed.startsWith('-----BEGIN RSA PRIVATE KEY-----') ||
      trimmed.startsWith('-----BEGIN PRIVATE KEY-----')) &&
    !trimmed.includes('placeholder') &&
    trimmed.length > 200
  );
}

const privateKeyIsValid = isValidPemKey(firebaseConfig.privateKey);

if (!privateKeyIsValid) {
  // eslint-disable-next-line no-console
  console.warn(
    '[Firebase] FIREBASE_PRIVATE_KEY is a placeholder or invalid PEM. ' +
      'Firebase Admin SDK will not be initialised. Push notifications are disabled.',
  );
}

// Guard against double-initialisation (e.g., during hot reload)
if (privateKeyIsValid && admin.apps.length === 0) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: firebaseConfig.projectId,
      clientEmail: firebaseConfig.clientEmail,
      privateKey: firebaseConfig.privateKey,
    }),
  });
}

/**
 * Firebase Cloud Messaging instance for sending push notifications.
 *
 * `null` when `FIREBASE_PRIVATE_KEY` is a placeholder or invalid PEM (e.g. in
 * development without real Firebase credentials). All callers must check for
 * `null` before using this instance.
 */
export const fcm: Messaging | null = privateKeyIsValid ? admin.messaging() : null;
