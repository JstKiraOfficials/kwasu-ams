import { PrismaClient } from '@prisma/client';
import { seedUniversityAndFaculties } from './faculties';
import { seedDepartments } from './departments';
import { seedProgrammes } from './programmes';
import { seedCourses } from './courses';
import { seedVenues } from './venues';
import { seedUsers } from './users';
import { seedStudents } from './students';
import { seedLecturers } from './lecturers';
import { seedAcademicSessions } from './academic-sessions';
import { seedTimetableEntries } from './timetable-entries';
import { seedEnrollments } from './enrollments';

// ============================================================================
// PRODUCTION GUARD — MANDATORY
// This seed script creates test accounts with known passwords.
// It must NEVER run against a production database.
// ============================================================================
if (process.env.NODE_ENV === 'production') {
  throw new Error('Seed script must never run in production. Exiting.');
}

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log('🌱 Starting database seed...');

  console.log('  → Seeding university and faculties...');
  await seedUniversityAndFaculties(prisma);

  console.log('  → Seeding departments...');
  await seedDepartments(prisma);

  console.log('  → Seeding programmes...');
  await seedProgrammes(prisma);

  console.log('  → Seeding courses...');
  await seedCourses(prisma);

  console.log('  → Seeding venues...');
  await seedVenues(prisma);

  console.log('  → Seeding users...');
  await seedUsers(prisma);

  console.log('  → Seeding students...');
  await seedStudents(prisma);

  console.log('  → Seeding lecturers...');
  await seedLecturers(prisma);

  console.log('  → Seeding academic sessions...');
  await seedAcademicSessions(prisma);

  console.log('  → Seeding timetable entries...');
  await seedTimetableEntries(prisma);

  console.log('  → Seeding enrollments...');
  await seedEnrollments(prisma);

  console.log('✅ Database seed complete.');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
