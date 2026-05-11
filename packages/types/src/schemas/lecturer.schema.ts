import { z } from 'zod';

// STAFF_ID_REGEX is defined in packages/utils/src/constants/identity.ts (Phase 07).
// Imported here once Phase 07 is implemented.
// Placeholder regex matches the same pattern for build compatibility.
const STAFF_ID_REGEX = /^[Kk][Ww][Aa][Ss][Uu]\/[A-Za-z]{2,5}\/[A-Za-z]{2,5}\/\d{2,5}$/;

export const CreateLecturerSchema = z.object({
  userId: z.string().uuid(),
  staffId: z.string().regex(STAFF_ID_REGEX, 'Invalid staff ID format'),
  departmentId: z.string().uuid(),
  title: z.string().optional(),
});

export type CreateLecturerInput = z.infer<typeof CreateLecturerSchema>;
