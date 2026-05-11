import { z } from 'zod';

export const CreateTimetableEntrySchema = z.object({
  courseSectionId: z.string().uuid(),
  semesterId: z.string().uuid(),
  venueId: z.string().uuid(),
  dayOfWeek: z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Time must be in HH:MM format'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Time must be in HH:MM format'),
});

export type CreateTimetableEntryInput = z.infer<typeof CreateTimetableEntrySchema>;
