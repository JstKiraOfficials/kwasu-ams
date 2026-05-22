/**
 * @file notification-dispatcher.service.ts
 * @module modules/notifications
 *
 * Central notification dispatcher for KWASU AMS.
 *
 * `dispatch()` is the single entry point for all notification sends. It:
 * 1. Looks up the recipient's language preference and contact details.
 * 2. Resolves the correct channels and template key for the trigger.
 * 3. Renders the template in the recipient's language.
 * 4. Calls the appropriate channel service (push/SMS/email).
 * 5. Creates a `Notification` record for each send attempt.
 *
 * All sends are fire-and-forget — this function never throws on channel
 * failure. Failures are recorded in the `Notification` record.
 *
 * Template selection: English (`en`) is the default. Yoruba (`yo`) is used
 * when `user.languagePreference === 'yo'`.
 */

import { prisma } from '../../lib/prisma.js';
import { sendPushNotification } from './push.service.js';
import { sendSms } from './sms.service.js';
import { sendEmail } from './email.service.js';

// Static imports for all SMS templates (avoids dynamic import resolution issues)
import * as enSessionOpen from './templates/sms/en/session-open.js';
import * as enMarkedAbsent from './templates/sms/en/marked-absent.js';
import * as enAttendanceWarning from './templates/sms/en/attendance-warning.js';
import * as enExamBar from './templates/sms/en/exam-bar.js';
import * as enExcuseDecided from './templates/sms/en/excuse-decided.js';
import * as enClassCancelled from './templates/sms/en/class-cancelled.js';
import * as enMakeupScheduled from './templates/sms/en/makeup-scheduled.js';
import * as enLecturerReminder from './templates/sms/en/lecturer-reminder.js';
import * as enTempPassword from './templates/sms/en/temp-password.js';
import * as enWeeklySummary from './templates/sms/en/weekly-summary.js';
import * as yoSessionOpen from './templates/sms/yo/session-open.js';
import * as yoMarkedAbsent from './templates/sms/yo/marked-absent.js';
import * as yoAttendanceWarning from './templates/sms/yo/attendance-warning.js';
import * as yoExamBar from './templates/sms/yo/exam-bar.js';
import * as yoExcuseDecided from './templates/sms/yo/excuse-decided.js';
import * as yoClassCancelled from './templates/sms/yo/class-cancelled.js';
import * as yoMakeupScheduled from './templates/sms/yo/makeup-scheduled.js';
import * as yoLecturerReminder from './templates/sms/yo/lecturer-reminder.js';
import * as yoTempPassword from './templates/sms/yo/temp-password.js';
import * as yoWeeklySummary from './templates/sms/yo/weekly-summary.js';

// Static imports for email templates
import * as emailAttendanceWarning from './templates/email/attendance-warning.js';
import * as emailEligibilityConfirmed from './templates/email/eligibility-confirmed.js';
import * as emailExamBar from './templates/email/exam-bar.js';
import * as emailExcuseSubmitted from './templates/email/excuse-submitted.js';
import * as emailWeeklySummary from './templates/email/weekly-summary.js';
import * as emailCourseAverageAlert from './templates/email/course-average-alert.js';
import * as emailLecturerInactive from './templates/email/lecturer-inactive.js';

// =============================================================================
// Template registries
// =============================================================================

/** SMS template registry keyed by `{lang}/{templateKey}`. */
const SMS_TEMPLATES: Record<string, { render: (d: Record<string, string>) => string }> = {
  'en/session-open': enSessionOpen,
  'en/marked-absent': enMarkedAbsent,
  'en/attendance-warning': enAttendanceWarning,
  'en/exam-bar': enExamBar,
  'en/excuse-decided': enExcuseDecided,
  'en/class-cancelled': enClassCancelled,
  'en/makeup-scheduled': enMakeupScheduled,
  'en/lecturer-reminder': enLecturerReminder,
  'en/temp-password': enTempPassword,
  'en/weekly-summary': enWeeklySummary,
  'yo/session-open': yoSessionOpen,
  'yo/marked-absent': yoMarkedAbsent,
  'yo/attendance-warning': yoAttendanceWarning,
  'yo/exam-bar': yoExamBar,
  'yo/excuse-decided': yoExcuseDecided,
  'yo/class-cancelled': yoClassCancelled,
  'yo/makeup-scheduled': yoMakeupScheduled,
  'yo/lecturer-reminder': yoLecturerReminder,
  'yo/temp-password': yoTempPassword,
  'yo/weekly-summary': yoWeeklySummary,
};

/** Email template registry keyed by template key. */
const EMAIL_TEMPLATES: Record<string, { render: (d: Record<string, string>) => string }> = {
  'attendance-warning': emailAttendanceWarning,
  'eligibility-confirmed': emailEligibilityConfirmed,
  'exam-bar': emailExamBar,
  'excuse-submitted': emailExcuseSubmitted,
  'weekly-summary': emailWeeklySummary,
  'course-average-alert': emailCourseAverageAlert,
  'lecturer-inactive': emailLecturerInactive,
};

// =============================================================================
// Types
// =============================================================================

/**
 * All notification trigger keys used across KWASU AMS.
 *
 * Each trigger maps to a set of channels and a template key via
 * {@link TRIGGER_CONFIG}.
 */
export type NotificationTrigger =
  | 'SESSION_OPEN'
  | 'SESSION_CLOSING_5MIN'
  | 'MARKED_ABSENT'
  | 'ATTENDANCE_80'
  | 'ATTENDANCE_77'
  | 'ATTENDANCE_75'
  | 'EXAM_BAR'
  | 'ELIGIBILITY_CONFIRMED'
  | 'EXCUSE_DECIDED'
  | 'CLASS_CANCELLED'
  | 'MAKEUP_SCHEDULED'
  | 'WELFARE_REFERRAL'
  | 'LECTURER_REMINDER'
  | 'STUDENT_BELOW_75'
  | 'EXCUSE_SUBMITTED'
  | 'ANOMALY_FLAGGED'
  | 'COURSE_AVERAGE_LOW'
  | 'LECTURER_INACTIVE'
  | 'EXCUSE_ESCALATED'
  | 'TEMP_PASSWORD'
  | 'WEEKLY_SUMMARY';

/** Channel flags for a trigger configuration entry. */
interface TriggerConfig {
  /** Whether to send a push notification. */
  push: boolean;
  /** Whether to send an SMS. */
  sms: boolean;
  /** Whether to send an email. */
  email: boolean;
  /** SMS template key (filename without extension). */
  smsTemplate: string;
  /** Email template key (filename without extension), or null if no email. */
  emailTemplate: string | null;
  /** Push notification title. */
  pushTitle: string;
}

// =============================================================================
// Trigger configuration map
// =============================================================================

/**
 * Maps each {@link NotificationTrigger} to its channel configuration and
 * template keys.
 */
const TRIGGER_CONFIG: Record<NotificationTrigger, TriggerConfig> = {
  SESSION_OPEN: {
    push: true,
    sms: true,
    email: false,
    smsTemplate: 'session-open',
    emailTemplate: null,
    pushTitle: 'Attendance Open',
  },
  SESSION_CLOSING_5MIN: {
    push: true,
    sms: false,
    email: false,
    smsTemplate: 'session-open',
    emailTemplate: null,
    pushTitle: 'Session Closing Soon',
  },
  MARKED_ABSENT: {
    push: true,
    sms: true,
    email: false,
    smsTemplate: 'marked-absent',
    emailTemplate: null,
    pushTitle: 'Marked Absent',
  },
  ATTENDANCE_80: {
    push: true,
    sms: true,
    email: true,
    smsTemplate: 'attendance-warning',
    emailTemplate: 'attendance-warning',
    pushTitle: 'Attendance Warning',
  },
  ATTENDANCE_77: {
    push: true,
    sms: true,
    email: true,
    smsTemplate: 'attendance-warning',
    emailTemplate: 'attendance-warning',
    pushTitle: 'Attendance Warning',
  },
  ATTENDANCE_75: {
    push: true,
    sms: true,
    email: true,
    smsTemplate: 'attendance-warning',
    emailTemplate: 'attendance-warning',
    pushTitle: 'Attendance Critical',
  },
  EXAM_BAR: {
    push: true,
    sms: true,
    email: true,
    smsTemplate: 'exam-bar',
    emailTemplate: 'exam-bar',
    pushTitle: 'Exam Bar Notice',
  },
  ELIGIBILITY_CONFIRMED: {
    push: true,
    sms: false,
    email: true,
    smsTemplate: 'session-open',
    emailTemplate: 'eligibility-confirmed',
    pushTitle: 'Eligibility Confirmed',
  },
  EXCUSE_DECIDED: {
    push: true,
    sms: true,
    email: false,
    smsTemplate: 'excuse-decided',
    emailTemplate: null,
    pushTitle: 'Excuse Decision',
  },
  CLASS_CANCELLED: {
    push: true,
    sms: true,
    email: false,
    smsTemplate: 'class-cancelled',
    emailTemplate: null,
    pushTitle: 'Class Cancelled',
  },
  MAKEUP_SCHEDULED: {
    push: true,
    sms: true,
    email: false,
    smsTemplate: 'makeup-scheduled',
    emailTemplate: null,
    pushTitle: 'Make-up Class Scheduled',
  },
  WELFARE_REFERRAL: {
    push: true,
    sms: false,
    email: false,
    smsTemplate: 'session-open',
    emailTemplate: null,
    pushTitle: 'Welfare Support',
  },
  LECTURER_REMINDER: {
    push: true,
    sms: true,
    email: false,
    smsTemplate: 'lecturer-reminder',
    emailTemplate: null,
    pushTitle: 'Class Reminder',
  },
  STUDENT_BELOW_75: {
    push: true,
    sms: false,
    email: false,
    smsTemplate: 'attendance-warning',
    emailTemplate: null,
    pushTitle: 'Attendance Warning',
  },
  EXCUSE_SUBMITTED: {
    push: true,
    sms: false,
    email: true,
    smsTemplate: 'session-open',
    emailTemplate: 'excuse-submitted',
    pushTitle: 'New Excuse Submitted',
  },
  ANOMALY_FLAGGED: {
    push: true,
    sms: false,
    email: false,
    smsTemplate: 'session-open',
    emailTemplate: null,
    pushTitle: 'Attendance Flag',
  },
  COURSE_AVERAGE_LOW: {
    push: true,
    sms: false,
    email: true,
    smsTemplate: 'session-open',
    emailTemplate: 'course-average-alert',
    pushTitle: 'Course Average Alert',
  },
  LECTURER_INACTIVE: {
    push: true,
    sms: false,
    email: true,
    smsTemplate: 'session-open',
    emailTemplate: 'lecturer-inactive',
    pushTitle: 'Lecturer Inactivity Alert',
  },
  EXCUSE_ESCALATED: {
    push: true,
    sms: false,
    email: false,
    smsTemplate: 'session-open',
    emailTemplate: null,
    pushTitle: 'Excuse Escalated',
  },
  TEMP_PASSWORD: {
    push: false,
    sms: true,
    email: false,
    smsTemplate: 'temp-password',
    emailTemplate: null,
    pushTitle: 'Temporary Password',
  },
  WEEKLY_SUMMARY: {
    push: true,
    sms: true,
    email: true,
    smsTemplate: 'weekly-summary',
    emailTemplate: 'weekly-summary',
    pushTitle: 'Weekly Summary',
  },
};

// =============================================================================
// Template renderers (use static registry)
// =============================================================================

/**
 * Renders an SMS template for the given language and template key.
 *
 * Falls back to English if the Yoruba template is not found.
 *
 * @param lang        - Language code: `'en'` or `'yo'`.
 * @param templateKey - Template filename without extension.
 * @param data        - Template data object.
 * @returns Rendered SMS string.
 */
function renderSmsTemplate(
  lang: string,
  templateKey: string,
  data: Record<string, string>,
): string {
  const key = `${lang}/${templateKey}`;
  const mod = SMS_TEMPLATES[key] ?? SMS_TEMPLATES[`en/${templateKey}`];
  if (!mod) return `Notification: ${templateKey}`;
  return mod.render(data);
}

/**
 * Renders an email template for the given template key.
 *
 * @param templateKey - Template filename without extension.
 * @param data        - Template data object.
 * @returns Rendered HTML string.
 */
function renderEmailTemplate(templateKey: string, data: Record<string, string>): string {
  const mod = EMAIL_TEMPLATES[templateKey];
  if (!mod) return `<p>Notification: ${templateKey}</p>`;
  return mod.render(data);
}

// =============================================================================
// dispatch
// =============================================================================

/**
 * Dispatches a notification to a recipient via all configured channels for
 * the given trigger.
 *
 * Looks up the recipient's language preference, renders the appropriate
 * templates, and calls push/SMS/email services. Creates a `Notification`
 * record for each send attempt. Never throws — all failures are logged.
 *
 * @param recipientId - UUID of the `User` to notify.
 * @param trigger     - The {@link NotificationTrigger} that caused this notification.
 * @param data        - Template data object (keys depend on the trigger's template).
 * @returns A promise that resolves once all channel sends have been attempted.
 */
export async function dispatch(
  recipientId: string,
  trigger: NotificationTrigger,
  data: Record<string, string>,
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: recipientId },
    select: { id: true, phone: true, email: true, languagePreference: true },
  });

  if (!user) return;

  const lang = user.languagePreference ?? 'en';
  const config = TRIGGER_CONFIG[trigger];

  // ── Push ─────────────────────────────────────────────────────────────────
  if (config.push) {
    const smsText = renderSmsTemplate(lang, config.smsTemplate, data);
    const notif = await prisma.notification.create({
      data: {
        recipientId,
        channel: 'PUSH',
        templateKey: trigger,
        language: lang,
        body: smsText,
        status: 'PENDING',
      },
    });

    try {
      await sendPushNotification(recipientId, config.pushTitle, smsText, data);
      await prisma.notification.update({
        where: { id: notif.id },
        data: { status: 'SENT', sentAt: new Date() },
      });
    } catch (err) {
      await prisma.notification.update({
        where: { id: notif.id },
        data: { status: 'FAILED', failureReason: String(err) },
      });
    }
  }

  // ── SMS ──────────────────────────────────────────────────────────────────
  if (config.sms && user.phone) {
    const smsText = renderSmsTemplate(lang, config.smsTemplate, data);
    const notif = await prisma.notification.create({
      data: {
        recipientId,
        channel: 'SMS',
        templateKey: trigger,
        language: lang,
        body: smsText,
        status: 'PENDING',
      },
    });

    try {
      await sendSms(user.phone, smsText);
      await prisma.notification.update({
        where: { id: notif.id },
        data: { status: 'SENT', sentAt: new Date() },
      });
    } catch (err) {
      await prisma.notification.update({
        where: { id: notif.id },
        data: { status: 'FAILED', failureReason: String(err) },
      });
    }
  }

  // ── Email ─────────────────────────────────────────────────────────────────
  if (config.email && config.emailTemplate && user.email) {
    const htmlBody = renderEmailTemplate(config.emailTemplate, data);
    const notif = await prisma.notification.create({
      data: {
        recipientId,
        channel: 'EMAIL',
        templateKey: trigger,
        language: lang,
        subject: config.pushTitle,
        body: htmlBody,
        status: 'PENDING',
      },
    });

    try {
      await sendEmail(user.email, config.pushTitle, htmlBody);
      await prisma.notification.update({
        where: { id: notif.id },
        data: { status: 'SENT', sentAt: new Date() },
      });
    } catch (err) {
      await prisma.notification.update({
        where: { id: notif.id },
        data: { status: 'FAILED', failureReason: String(err) },
      });
    }
  }
}
