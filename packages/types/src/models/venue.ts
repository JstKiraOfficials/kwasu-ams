export interface IVenue {
  id: string;
  name: string;
  buildingName: string;
  latitude: number;
  longitude: number;
  geofenceRadius: number;
  capacity: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
