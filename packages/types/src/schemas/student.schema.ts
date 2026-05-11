import { z } from 'zod';
import { MATRIC_NUMBER_REGEX } from '@kwasu-ams/utils';

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
