import type { Role } from '../enums/role.enum.js';
import type { AttendanceStatus } from '../enums/attendance-status.enum.js';

export interface IManualOverride {
  id: string;
  attendanceRecordId: string;
  actorId: string;
  actorRole: Role;
  justification: string;
  beforeStatus: AttendanceStatus;
  afterStatus: AttendanceStatus;
  requiresAdminApproval: boolean;
  approvedById: string | null;
  approvedAt: Date | null;
  rejectedById: string | null;
  rejectedAt: Date | null;
  rejectionReason: string | null;
  createdAt: Date;
}
