import { z } from 'zod';
import { TicketCategory } from '../enums/ticket-status.enum.js';

export const CreateTicketSchema = z.object({
  category: z.nativeEnum(TicketCategory),
  subject: z.string().min(5),
  description: z.string().min(20),
});

export type CreateTicketInput = z.infer<typeof CreateTicketSchema>;
