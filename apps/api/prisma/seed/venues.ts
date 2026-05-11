import { PrismaClient } from '@prisma/client';

// All coordinates within KWASU Malete campus bounding box: lat 8.50–8.60, lng 4.50–4.60
// Campus centre: approximately 8.5520°N, 4.5340°E
const VENUES = [
  // Main Lecture Theatres
  {
    name: 'Main Lecture Theatre 1',
    buildingName: 'Main Lecture Theatre',
    lat: 8.552,
    lng: 4.534,
    radius: 75,
    capacity: 500,
  },
  {
    name: 'Main Lecture Theatre 2',
    buildingName: 'Main Lecture Theatre',
    lat: 8.5515,
    lng: 4.5345,
    radius: 75,
    capacity: 500,
  },
  {
    name: 'Main Lecture Theatre 3',
    buildingName: 'Main Lecture Theatre',
    lat: 8.551,
    lng: 4.535,
    radius: 75,
    capacity: 400,
  },
  // Science Block
  {
    name: 'Science Block LT1',
    buildingName: 'Science Block',
    lat: 8.553,
    lng: 4.536,
    radius: 50,
    capacity: 200,
  },
  {
    name: 'Science Block LT2',
    buildingName: 'Science Block',
    lat: 8.5535,
    lng: 4.5365,
    radius: 50,
    capacity: 200,
  },
  {
    name: 'Science Block Room 101',
    buildingName: 'Science Block',
    lat: 8.5538,
    lng: 4.5368,
    radius: 30,
    capacity: 60,
  },
  {
    name: 'Science Block Room 102',
    buildingName: 'Science Block',
    lat: 8.554,
    lng: 4.537,
    radius: 30,
    capacity: 60,
  },
  {
    name: 'Science Block Room 201',
    buildingName: 'Science Block',
    lat: 8.5542,
    lng: 4.5372,
    radius: 30,
    capacity: 60,
  },
  {
    name: 'Science Block Computer Lab',
    buildingName: 'Science Block',
    lat: 8.5545,
    lng: 4.5375,
    radius: 30,
    capacity: 50,
  },
  // Arts Block
  {
    name: 'Arts Block LT1',
    buildingName: 'Arts Block',
    lat: 8.55,
    lng: 4.532,
    radius: 50,
    capacity: 200,
  },
  {
    name: 'Arts Block LT2',
    buildingName: 'Arts Block',
    lat: 8.5505,
    lng: 4.5325,
    radius: 50,
    capacity: 200,
  },
  {
    name: 'Arts Block Room 101',
    buildingName: 'Arts Block',
    lat: 8.5508,
    lng: 4.5328,
    radius: 30,
    capacity: 60,
  },
  {
    name: 'Arts Block Room 102',
    buildingName: 'Arts Block',
    lat: 8.551,
    lng: 4.533,
    radius: 30,
    capacity: 60,
  },
  {
    name: 'Arts Block Seminar Room A',
    buildingName: 'Arts Block',
    lat: 8.5512,
    lng: 4.5332,
    radius: 30,
    capacity: 40,
  },
  // Social Sciences Block
  {
    name: 'Social Sciences Block LT1',
    buildingName: 'Social Sciences Block',
    lat: 8.549,
    lng: 4.531,
    radius: 50,
    capacity: 200,
  },
  {
    name: 'Social Sciences Block LT2',
    buildingName: 'Social Sciences Block',
    lat: 8.5495,
    lng: 4.5315,
    radius: 50,
    capacity: 200,
  },
  {
    name: 'Social Sciences Block Room 101',
    buildingName: 'Social Sciences Block',
    lat: 8.5498,
    lng: 4.5318,
    radius: 30,
    capacity: 60,
  },
  {
    name: 'Social Sciences Block Room 102',
    buildingName: 'Social Sciences Block',
    lat: 8.55,
    lng: 4.532,
    radius: 30,
    capacity: 60,
  },
  {
    name: 'Social Sciences Seminar Room A',
    buildingName: 'Social Sciences Block',
    lat: 8.5502,
    lng: 4.5322,
    radius: 30,
    capacity: 40,
  },
  // Library Complex
  {
    name: 'Library Seminar Room 1',
    buildingName: 'Library Complex',
    lat: 8.5525,
    lng: 4.5355,
    radius: 30,
    capacity: 40,
  },
  {
    name: 'Library Seminar Room 2',
    buildingName: 'Library Complex',
    lat: 8.5527,
    lng: 4.5357,
    radius: 30,
    capacity: 40,
  },
  // Administration Block
  {
    name: 'Admin Block Conference Room',
    buildingName: 'Administration Block',
    lat: 8.5518,
    lng: 4.5338,
    radius: 30,
    capacity: 30,
  },
  // New Academic Complex
  {
    name: 'New Academic Complex LT1',
    buildingName: 'New Academic Complex',
    lat: 8.555,
    lng: 4.538,
    radius: 75,
    capacity: 500,
  },
  {
    name: 'New Academic Complex LT2',
    buildingName: 'New Academic Complex',
    lat: 8.5555,
    lng: 4.5385,
    radius: 75,
    capacity: 500,
  },
  {
    name: 'New Academic Complex Room 101',
    buildingName: 'New Academic Complex',
    lat: 8.5558,
    lng: 4.5388,
    radius: 30,
    capacity: 60,
  },
  {
    name: 'New Academic Complex Room 102',
    buildingName: 'New Academic Complex',
    lat: 8.556,
    lng: 4.539,
    radius: 30,
    capacity: 60,
  },
  {
    name: 'New Academic Complex Room 201',
    buildingName: 'New Academic Complex',
    lat: 8.5562,
    lng: 4.5392,
    radius: 30,
    capacity: 60,
  },
  {
    name: 'New Academic Complex Room 202',
    buildingName: 'New Academic Complex',
    lat: 8.5564,
    lng: 4.5394,
    radius: 30,
    capacity: 60,
  },
  // Student Union Building
  {
    name: 'Student Union Hall',
    buildingName: 'Student Union Building',
    lat: 8.548,
    lng: 4.53,
    radius: 50,
    capacity: 300,
  },
  // Sports Complex
  {
    name: 'Sports Complex Classroom',
    buildingName: 'Sports Complex',
    lat: 8.547,
    lng: 4.529,
    radius: 30,
    capacity: 50,
  },
];

export async function seedVenues(prisma: PrismaClient): Promise<void> {
  for (const venue of VENUES) {
    const existing = await prisma.venue.findFirst({ where: { name: venue.name } });
    if (!existing) {
      await prisma.venue.create({
        data: {
          name: venue.name,
          buildingName: venue.buildingName,
          latitude: venue.lat,
          longitude: venue.lng,
          geofenceRadius: venue.radius,
          capacity: venue.capacity,
          isActive: true,
        },
      });
    }
  }
}
