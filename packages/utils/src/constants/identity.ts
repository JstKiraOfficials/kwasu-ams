// SINGLE SOURCE OF TRUTH — Never redefine these regexes elsewhere.
// This is the first implementation file in the KWASU AMS codebase.

/**
 * Valid matric number formats:
 *   22/47CSC/00001
 *   21D/12BIO/00234
 *   20/4MTH/10034
 *   19d/4CM/00712
 */
export const MATRIC_NUMBER_REGEX = /^\d{2}[dD]?\/\d{1,2}[A-Za-z]{1,3}\/\d{3,5}$/;

/**
 * Valid staff ID formats:
 *   KWASU/LEC/CSC/00134
 *   kwasu/HOD/BIO/012
 *   KWASU/DEAN/SCI/00001
 */
export const STAFF_ID_REGEX = /^[Kk][Ww][Aa][Ss][Uu]\/[A-Za-z]{2,5}\/[A-Za-z]{2,5}\/\d{2,5}$/;

/** Returns true if the identifier matches the matric number format. */
export function validateMatricNumber(identifier: string): boolean {
  return MATRIC_NUMBER_REGEX.test(identifier);
}

/** Returns true if the identifier matches the staff ID format. */
export function validateStaffId(identifier: string): boolean {
  return STAFF_ID_REGEX.test(identifier);
}

/** Returns the matric number normalised to uppercase. */
export function normaliseMatricNumber(matric: string): string {
  return matric.toUpperCase();
}
