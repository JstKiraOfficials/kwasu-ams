/**
 * @file lecturer-inactive.ts
 * @module modules/notifications/templates/email
 * HTML email template: lecturer inactivity alert.
 */

/**
 * Renders the HTML email body for a lecturer inactivity alert.
 * @param data - Template data containing `recipientName`, `lecturerName`, and `courseCode`.
 * @returns HTML string for the email body.
 */
export function render(data: Record<string, string>): string {
  return `<html><body>
<h2>Lecturer Inactivity Alert — ${data['courseCode']}</h2>
<p>Dear ${data['recipientName']},</p>
<p><strong>${data['lecturerName']}</strong> has not opened any sessions for <strong>${data['courseCode']}</strong> in the past two weeks.</p>
<p>Please follow up to ensure students are not disadvantaged.</p>
<p>KWASU Attendance Management System</p>
</body></html>`;
}
