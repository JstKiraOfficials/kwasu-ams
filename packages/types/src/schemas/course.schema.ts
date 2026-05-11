import { z } from 'zod';

const VALID_LEVELS = [100, 200, 300, 400, 500, 600] as const;

export const CreateCourseSchema = z.object({
  departmentId: z.string().uuid(),
  code: z.string().min(3).max(10),
  title: z.string().min(3),
  creditUnits: z.number().int().min(1).max(6),
  level: z
    .number()
    .int()
    .refine(
      (v): v is (typeof VALID_LEVELS)[number] => (VALID_LEVELS as readonly number[]).includes(v),
      { message: 'Level must be 100, 200, 300, 400, 500, or 600' },
    ),
  isElective: z.boolean().default(false),
});

export const EnrollStudentsSchema = z.object({
  studentIds: z.array(z.string().uuid()).min(1, 'At least one student ID is required'),
});

export type CreateCourseInput = z.infer<typeof CreateCourseSchema>;
export type EnrollStudentsInput = z.infer<typeof EnrollStudentsSchema>;
