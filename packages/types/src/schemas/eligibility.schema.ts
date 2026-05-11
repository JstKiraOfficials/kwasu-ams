import { z } from 'zod';

export const EligibilityAppealSchema = z.object({
  reason: z.string().min(20, 'Appeal reason must be at least 20 characters'),
});

export type EligibilityAppealInput = z.infer<typeof EligibilityAppealSchema>;
