/**
 * @file course-average-alert.ts
 * @module modules/notifications/templates/email
 * HTML email template: course average below threshold alert.
 */

/**
 * Renders the HTML email body for a course average alert.
 * @param data - Template data containing `recipientName`, `courseCode`, and `average`.
 * @returns HTML string for the email body.
 */
export function render(data: Record<string, string>): string {
  return `<html><body>
<h2>Course Average Alert — ${data['courseCode']}</h2>
<p>Dear ${data['recipientName']},</p>
<p>The average attendance for <strong>${data['courseCode']}</strong> has dropped to <strong>${data['average']}%</strong>, which is below the 60% threshold.</p>
<p>Please review and take appropriate action.</p>
<p>KWASU Attendance Management System</p>
</body></html>`;
}
