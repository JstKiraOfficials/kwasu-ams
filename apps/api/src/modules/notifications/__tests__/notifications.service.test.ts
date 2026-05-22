/**
 * @file notifications.service.test.ts
 * @module modules/notifications/__tests__
 *
 * Unit tests for the notification dispatcher service.
 *
 * All Prisma, push, SMS, and email service calls are mocked. Tests verify
 * that the correct channels are called for each trigger and that language
 * preference is respected.
 *
 * Test coverage:
 *
 * dispatch('SESSION_OPEN', ...)
 * - English user: calls SMS and push services with English template
 * - Yoruba user: calls SMS service with Yoruba template
 *
 * dispatch('ATTENDANCE_80', ...)
 * - Calls push, SMS, and email services
 *
 * dispatch('WELFARE_REFERRAL', ...)
 * - Calls only push service (no SMS, no email)
 *
 * dispatch('TEMP_PASSWORD', ...)
 * - Calls only SMS service (no push, no email)
 *
 * SMS send failure
 * - Creates Notification record with status FAILED, does not throw
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Mocks
// =============================================================================

vi.mock('../../../lib/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    notification: { create: vi.fn(), update: vi.fn() },
  },
}));

vi.mock('../push.service.js', () => ({
  sendPushNotification: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../sms.service.js', () => ({
  sendSms: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../email.service.js', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));

// =============================================================================
// Imports (after mocks)
// =============================================================================

import { dispatch } from '../notification-dispatcher.service.js';
import { prisma } from '../../../lib/prisma.js';
import { sendPushNotification } from '../push.service.js';
import { sendSms } from '../sms.service.js';
import { sendEmail } from '../email.service.js';

// =============================================================================
// Fixtures
// =============================================================================

const USER_ID = 'a0000000-0000-4000-8000-000000000001';
const NOTIF_ID = 'a0000000-0000-4000-8000-000000000002';

const makeUser = (lang = 'en') => ({
  id: USER_ID,
  phone: '+2348012345678',
  email: 'student@kwasu.edu.ng',
  languagePreference: lang,
});

const makeNotif = () => ({ id: NOTIF_ID });

// =============================================================================
// Shared setup
// =============================================================================

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.notification.create).mockResolvedValue(makeNotif() as never);
  vi.mocked(prisma.notification.update).mockResolvedValue(makeNotif() as never);
});

// =============================================================================
// SESSION_OPEN
// =============================================================================

describe("dispatch('SESSION_OPEN', ...)", () => {
  it('calls push and SMS for an English-preference user', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(makeUser('en') as never);

    await dispatch(USER_ID, 'SESSION_OPEN', { courseCode: 'BIO201' });

    expect(sendPushNotification).toHaveBeenCalledOnce();
    expect(sendSms).toHaveBeenCalledOnce();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('calls SMS with Yoruba template for a Yoruba-preference user', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(makeUser('yo') as never);

    await dispatch(USER_ID, 'SESSION_OPEN', { courseCode: 'BIO201' });

    expect(sendSms).toHaveBeenCalledOnce();
    const [, message] = vi.mocked(sendSms).mock.calls[0]!;
    // Yoruba template contains Yoruba text
    expect(message).toContain('BIO201');
    expect(message).not.toContain('Attendance is now open'); // English phrase absent
  });
});

// =============================================================================
// ATTENDANCE_80
// =============================================================================

describe("dispatch('ATTENDANCE_80', ...)", () => {
  it('calls push, SMS, and email services', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(makeUser() as never);

    await dispatch(USER_ID, 'ATTENDANCE_80', { courseCode: 'BIO201', percentage: '80' });

    expect(sendPushNotification).toHaveBeenCalledOnce();
    expect(sendSms).toHaveBeenCalledOnce();
    expect(sendEmail).toHaveBeenCalledOnce();
  });
});

// =============================================================================
// WELFARE_REFERRAL
// =============================================================================

describe("dispatch('WELFARE_REFERRAL', ...)", () => {
  it('calls only push service', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(makeUser() as never);

    await dispatch(USER_ID, 'WELFARE_REFERRAL', {});

    expect(sendPushNotification).toHaveBeenCalledOnce();
    expect(sendSms).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

// =============================================================================
// TEMP_PASSWORD
// =============================================================================

describe("dispatch('TEMP_PASSWORD', ...)", () => {
  it('calls only SMS service', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(makeUser() as never);

    await dispatch(USER_ID, 'TEMP_PASSWORD', {
      password: 'Abc123!@#',
      url: 'https://ams.kwasu.edu.ng',
    });

    expect(sendSms).toHaveBeenCalledOnce();
    expect(sendPushNotification).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

// =============================================================================
// SMS failure handling
// =============================================================================

describe('SMS send failure', () => {
  it('creates a FAILED Notification record and does not throw', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(makeUser() as never);
    vi.mocked(sendSms).mockRejectedValueOnce(new Error('Gateway timeout'));

    await expect(
      dispatch(USER_ID, 'SESSION_OPEN', { courseCode: 'BIO201' }),
    ).resolves.toBeUndefined();

    // The SMS notification record should be updated to FAILED
    const updateCalls = vi.mocked(prisma.notification.update).mock.calls;
    const failedUpdate = updateCalls.find(
      (call) => (call[0].data as { status?: string }).status === 'FAILED',
    );
    expect(failedUpdate).toBeDefined();
  });
});
