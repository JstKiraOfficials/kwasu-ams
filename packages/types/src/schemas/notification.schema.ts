import { z } from 'zod';

export const NotificationPreferencesSchema = z.object({
  push: z.boolean(),
  sms: z.boolean(),
  email: z.boolean(),
});

export type NotificationPreferencesInput = z.infer<typeof NotificationPreferencesSchema>;
