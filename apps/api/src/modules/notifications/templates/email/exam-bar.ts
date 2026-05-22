/**
 * @file exam-bar.ts
 * @module modules/notifications/templates/email
 * HTML email template: student barred from exam.
 */

/**
 * Renders the HTML email body for an exam bar notification.
 * @param data - Template data containing `studentName` and `courseCode`.
 * @returns HTML string for the email body.
 */
export function render(data: Record<string, string>): string {
  return `<html><body>
<h2>Exam Bar Notice — ${data['courseCode']}</h2>
<p>Dear ${data['studentName']},</p>
<p>You have been <strong>barred from the ${data['courseCode']} examination</strong> due to insufficient attendance.</p>
<p>Please contact your lecturer or HOD if you believe this is an error.</p>
<p>KWASU Attendance Management System</p>
</body></html>`;
}
