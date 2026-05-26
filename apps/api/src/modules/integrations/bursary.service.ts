/**
 * @file bursary.service.ts
 * @module modules/integrations
 *
 * Stub for KWASU Bursary clearance integration.
 * Pending external API specification from KWASU IT department.
 */

/**
 * Checks whether a student has financial clearance from the Bursary.
 *
 * @param _studentId - UUID of the student to check clearance for.
 * @throws Always — not implemented in v1.0.
 */
export async function checkClearance(_studentId: string): Promise<never> {
  throw new Error('Not implemented');
}
