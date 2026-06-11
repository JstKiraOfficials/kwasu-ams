import type { IUserPublic } from './user';

export interface IStudent {
  id: string;
  userId: string;
  matricNumber: string;
  programmeId: string;
  level: number;
  hasCarryOver: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IStudentWithUser extends IStudent {
  user: IUserPublic;
}
