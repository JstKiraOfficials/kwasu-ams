import { z } from 'zod';
import { STAFF_ID_REGEX } from '@kwasu-ams/utils';

export const CreateLecturerSchema = z.object({
  userId: z.string().uuid(),
  staffId: z.string().regex(STAFF_ID_REGEX, 'Invalid staff ID format'),
  departmentId: z.string().uuid(),
  title: z.string().optional(),
});

export type CreateLecturerInput = z.infer<typeof CreateLecturerSchema>;
