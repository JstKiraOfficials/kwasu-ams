/**
 * @file eligibility-confirmed.ts
 * @module modules/notifications/templates/email
 * HTML email template: exam eligibility confirmed.
 */

/**
 * Renders the HTML email body for an eligibility confirmation.
 * @param data - Template data containing `studentName`, `courseCode`, and `percentage`.
 * @returns HTML string for the email body.
 */
export function render(data: Record<string, string>): string {
  return `<html><body>
<h2>Exam Eligibility Confirmed — ${data['courseCode']}</h2>
<p>Dear ${data['studentName']},</p>
<p>You are <strong>eligible</strong> to sit the ${data['courseCode']} examination with an attendance of <strong>${data['percentage']}%</strong>.</p>
<p>KWASU Attendance Management System</p>
</body></html>`;
}
