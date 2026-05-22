/**
 * @file weekly-summary.ts
 * @module modules/notifications/templates/email
 * HTML email template: weekly attendance summary.
 */

/**
 * Renders the HTML email body for a weekly attendance summary.
 * @param data - Template data containing `recipientName` and `summary`.
 * @returns HTML string for the email body.
 */
export function render(data: Record<string, string>): string {
  return `<html><body>
<h2>Weekly Attendance Summary</h2>
<p>Dear ${data['recipientName']},</p>
<pre>${data['summary']}</pre>
<p>KWASU Attendance Management System</p>
</body></html>`;
}
