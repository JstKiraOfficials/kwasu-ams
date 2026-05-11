import { z } from 'zod';

const checkinBase = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  deviceFingerprint: z.string().min(1),
  mockLocationEnabled: z.boolean().default(false),
  deviceRooted: z.boolean().default(false),
});

export const GpsCheckinSchema = checkinBase.extend({
  sessionId: z.string().uuid(),
});

export const QrCheckinSchema = checkinBase.extend({
  qrToken: z.string().min(1),
});

export const CodeCheckinSchema = checkinBase.extend({
  sessionId: z.string().uuid(),
  code: z.string().min(6).max(8),
});

export type GpsCheckinInput = z.infer<typeof GpsCheckinSchema>;
export type QrCheckinInput = z.infer<typeof QrCheckinSchema>;
export type CodeCheckinInput = z.infer<typeof CodeCheckinSchema>;
