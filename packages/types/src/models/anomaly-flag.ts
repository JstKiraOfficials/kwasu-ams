import type { AnomalyType } from '../enums/anomaly-type.enum';

export interface IAnomalyFlag {
  id: string;
  studentId: string;
  sessionId: string | null;
  flagType: AnomalyType;
  description: string;
  isReviewed: boolean;
  reviewedById: string | null;
  reviewedAt: Date | null;
  reviewAction: string | null;
  reviewNote: string | null;
  createdAt: Date;
}
