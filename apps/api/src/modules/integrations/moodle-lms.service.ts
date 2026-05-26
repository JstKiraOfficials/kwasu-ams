/**
 * @file moodle-lms.service.ts
 * @module modules/integrations
 *
 * Stub for Moodle LMS attendance sync integration.
 * Pending external API specification from KWASU IT department.
 */

/**
 * Syncs attendance data to Moodle LMS for a given course.
 *
 * @param _courseId - UUID of the course to sync attendance for.
 * @throws Always — not implemented in v1.0.
 */
export async function syncAttendance(_courseId: string): Promise<never> {
  throw new Error('Not implemented');
}
