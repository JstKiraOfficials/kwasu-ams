export interface IFaculty {
  id: string;
  universityId: string;
  name: string;
  code: string;
  deanId: string | null;
  createdAt: Date;
  updatedAt: Date;
}
