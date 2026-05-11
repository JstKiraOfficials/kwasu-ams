import { z } from 'zod';

export const RegisterDeviceSchema = z.object({
  deviceFingerprint: z.string().min(10),
  platform: z.enum(['ios', 'android']),
  deviceModel: z.string().optional(),
  osVersion: z.string().optional(),
  isPrimary: z.boolean().default(true),
});

export type RegisterDeviceInput = z.infer<typeof RegisterDeviceSchema>;
