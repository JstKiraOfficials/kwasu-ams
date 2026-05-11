import { z } from 'zod';

const WEBHOOK_EVENTS = [
  'attendance.session.opened',
  'attendance.session.closed',
  'attendance.checkin.recorded',
  'student.eligibility.barred',
  'student.eligibility.confirmed',
  'excuse.approved',
  'excuse.rejected',
] as const;

export const CreateWebhookSchema = z.object({
  url: z.string().url(),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1, 'At least one event is required'),
  secret: z.string().min(16, 'Secret must be at least 16 characters'),
});

export type CreateWebhookInput = z.infer<typeof CreateWebhookSchema>;
