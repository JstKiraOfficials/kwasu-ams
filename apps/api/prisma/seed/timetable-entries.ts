import { PrismaClient, DayOfWeek, SemesterType } from '@prisma/client';

const DAYS: DayOfWeek[] = [
  DayOfWeek.MONDAY,
  DayOfWeek.TUESDAY,
  DayOfWeek.WEDNESDAY,
  DayOfWeek.THURSDAY,
  DayOfWeek.FRIDAY,
];

const TIME_SLOTS = [
  { start: '08:00', end: '10:00' },
  { start: '10:00', end: '12:00' },
  { start: '12:00', end: '14:00' },
  { start: '14:00', end: '16:00' },
  { start: '16:00', end: '18:00' },
];

export async function seedTimetableEntries(prisma: PrismaClient): Promise<void> {
  // Get active semester
  const activeSemester = await prisma.semester.findFirstOrThrow({
    where: { isActive: true, type: SemesterType.FIRST },
  });

  // Get all courses
  const courses = await prisma.course.findMany({ orderBy: { code: 'asc' } });

  // Get all venues
  const venues = await prisma.venue.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
  });

  // Get all lecturers
  const lecturers = await prisma.lecturer.findMany({ orderBy: { staffId: 'asc' } });

  let slotIndex = 0;

  for (let i = 0; i < courses.length; i++) {
    const course = courses[i]!;
    const venue = venues[i % venues.length]!;
    const lecturer = lecturers[i % lecturers.length]!;
    const day = DAYS[slotIndex % DAYS.length]!;
    const timeSlot = TIME_SLOTS[Math.floor(slotIndex / DAYS.length) % TIME_SLOTS.length]!;

    // Create CourseSection (Section A) for this course in the active semester
    const section = await prisma.courseSection.upsert({
      where: {
        courseId_semesterId_sectionLabel: {
          courseId: course.id,
          semesterId: activeSemester.id,
          sectionLabel: 'A',
        },
      },
      update: {},
      create: {
        courseId: course.id,
        semesterId: activeSemester.id,
        sectionLabel: 'A',
        lecturerId: lecturer.id,
        maxEnrollment: 200,
      },
    });

    // Create TimetableEntry — skip if slot already taken for this venue+day+time+semester
    const existingEntry = await prisma.timetableEntry.findFirst({
      where: {
        dayOfWeek: day,
        startTime: timeSlot.start,
        venueId: venue.id,
        semesterId: activeSemester.id,
      },
    });

    if (!existingEntry) {
      await prisma.timetableEntry.upsert({
        where: {
          dayOfWeek_startTime_courseSectionId_semesterId: {
            courseSectionId: section.id,
            semesterId: activeSemester.id,
            dayOfWeek: day,
            startTime: timeSlot.start,
          },
        },
        update: {},
        create: {
          courseSectionId: section.id,
          semesterId: activeSemester.id,
          venueId: venue.id,
          dayOfWeek: day,
          startTime: timeSlot.start,
          endTime: timeSlot.end,
        },
      });
    }

    slotIndex++;
  }
}
