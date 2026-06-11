import type { IUserPublic } from './user';

export interface ILecturer {
  id: string;
  userId: string;
  staffId: string;
  departmentId: string;
  title: string | null;
  accountabilityScore: number | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Lecturer shape for API responses to non-management roles — score omitted. */
export type ILecturerPublic = Omit<ILecturer, 'accountabilityScore'>;

/** Lecturer shape for HOD+ responses — includes accountability score. */
export interface ILecturerWithScore extends ILecturer {
  user: IUserPublic;
}
