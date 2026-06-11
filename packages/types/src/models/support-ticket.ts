import type { Role } from '../enums/role.enum';
import type { TicketStatus, TicketCategory } from '../enums/ticket-status.enum';

export interface ISupportTicket {
  id: string;
  submittedById: string;
  category: TicketCategory;
  subject: string;
  description: string;
  status: TicketStatus;
  assignedRole: Role | null;
  assignedToId: string | null;
  resolution: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
