/**
 * @file result-management.service.ts
 * @module modules/integrations
 *
 * Stub for KWASU Result Management System (RMS) integration.
 * Pending external API specification from KWASU IT department.
 */

/**
 * Syncs academic results from the Result Management System for a given semester.
 *
 * @param _semesterId - UUID of the semester to sync results for.
 * @throws Always — not implemented in v1.0.
 */
export async function syncResults(_semesterId: string): Promise<never> {
  throw new Error('Not implemented');
}
