/**
 * @file attendance-warning.ts
 * @module modules/notifications/templates/email
 * HTML email template: attendance warning.
 */

/**
 * Renders the HTML email body for an attendance warning.
 * @param data - Template data containing `studentName`, `courseCode`, `percentage`, and `threshold`.
 * @returns HTML string for the email body.
 */
export function render(data: Record<string, string>): string {
  return `<html><body>
<h2>Attendance Warning — ${data['courseCode']}</h2>
<p>Dear ${data['studentName']},</p>
<p>Your current attendance in <strong>${data['courseCode']}</strong> is <strong>${data['percentage']}%</strong>.</p>
<p>The minimum required attendance is <strong>${data['threshold']}%</strong>. Please attend all remaining classes to avoid being barred from the examination.</p>
<p>KWASU Attendance Management System</p>
</body></html>`;
}
