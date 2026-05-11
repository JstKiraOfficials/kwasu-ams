import type { DayOfWeek } from '../enums/day-of-week.enum.js';

export interface ITimetableEntry {
  id: string;
  courseSectionId: string;
  semesterId: string;
  venueId: string;
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  createdAt: Date;
  updatedAt: Date;
}
