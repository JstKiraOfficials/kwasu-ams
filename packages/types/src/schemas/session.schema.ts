import { z } from 'zod';
import { AttendanceStatus } from '../enums/attendance-status.enum';

export const CreateSessionSchema = z.object({
  courseSectionId: z.string().uuid(),
  venueId: z.string().uuid(),
  scheduledStart: z.string().datetime(),
  scheduledEnd: z.string().datetime(),
  isMakeUp: z.boolean().default(false),
});

export const OverrideAttendanceSchema = z.object({
  status: z.nativeEnum(AttendanceStatus),
  justification: z.string().min(20, 'Justification must be at least 20 characters'),
});

export type CreateSessionInput = z.infer<typeof CreateSessionSchema>;
export type OverrideAttendanceInput = z.infer<typeof OverrideAttendanceSchema>;
