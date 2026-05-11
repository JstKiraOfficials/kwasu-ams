import { z } from 'zod';

// MATRIC_NUMBER_REGEX is defined in packages/utils/src/constants/identity.ts (Phase 07).
// Imported here once Phase 07 is implemented.
// Placeholder regex matches the same pattern for build compatibility.
const MATRIC_NUMBER_REGEX = /^\d{2}[dD]?\/\d{1,2}[A-Za-z]{1,3}\/\d{3,5}$/;

const VALID_LEVELS = [100, 200, 300, 400, 500, 600] as const;

export const CreateStudentSchema = z.object({
  userId: z.string().uuid(),
  matricNumber: z.string().regex(MATRIC_NUMBER_REGEX, 'Invalid matric number format'),
  programmeId: z.string().uuid(),
  level: z
    .number()
    .int()
    .refine(
      (v): v is (typeof VALID_LEVELS)[number] => (VALID_LEVELS as readonly number[]).includes(v),
      { message: 'Level must be 100, 200, 300, 400, 500, or 600' },
    ),
});

export type CreateStudentInput = z.infer<typeof CreateStudentSchema>;
