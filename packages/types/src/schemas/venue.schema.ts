import { z } from 'zod';

export const CreateVenueSchema = z.object({
  name: z.string().min(2),
  buildingName: z.string().min(2),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  geofenceRadius: z.number().int().min(30).max(150).default(50),
  capacity: z.number().int().min(1),
});

export type CreateVenueInput = z.infer<typeof CreateVenueSchema>;
