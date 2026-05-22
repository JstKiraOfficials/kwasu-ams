/**
 * @file excuse-submitted.ts
 * @module modules/notifications/templates/email
 * HTML email template: excuse letter submitted (notification to lecturer).
 */

/**
 * Renders the HTML email body notifying a lecturer of a new excuse submission.
 * @param data - Template data containing `lecturerName`, `studentName`, and `courseCode`.
 * @returns HTML string for the email body.
 */
export function render(data: Record<string, string>): string {
  return `<html><body>
<h2>New Excuse Letter — ${data['courseCode']}</h2>
<p>Dear ${data['lecturerName']},</p>
<p><strong>${data['studentName']}</strong> has submitted an excuse letter for ${data['courseCode']}.</p>
<p>Please log in to KWASU AMS to review and respond.</p>
<p>KWASU Attendance Management System</p>
</body></html>`;
}
