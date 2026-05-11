import type { AttendanceStatus } from '../enums/attendance-status.enum.js';
import type { CheckInMethod } from '../enums/check-in-method.enum.js';

export interface IAttendanceRecord {
  id: string;
  studentId: string;
  sessionId: string;
  enrollmentId: string;
  status: AttendanceStatus;
  checkInMethod: CheckInMethod | null;
  checkedInAt: Date | null;
  deviceRooted: boolean;
  spoofingFlagged: boolean;
  createdAt: Date;
  updatedAt: Date;
}
