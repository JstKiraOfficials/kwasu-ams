/**
 * @file firebase.ts
 * @module lib
 *
 * Firebase Admin SDK singleton initialisation for KWASU AMS.
 *
 * Initialises the Firebase app once using service account credentials from
 * `config/firebase.ts`. Guards against double-initialisation during hot reload.
 *
 * Exports the FCM messaging instance used by the push notification service
 * (Phase 25).
 */

import admin from 'firebase-admin';
import type { Messaging } from 'firebase-admin/messaging';
import { firebaseConfig } from '../config/firebase.js';

// Guard against double-initialisation (e.g., during hot reload)
if (admin.apps.length === 0) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: firebaseConfig.projectId,
      clientEmail: firebaseConfig.clientEmail,
      privateKey: firebaseConfig.privateKey,
    }),
  });
}

/** Firebase Cloud Messaging instance for sending push notifications. */
export const fcm: Messaging = admin.messaging();
