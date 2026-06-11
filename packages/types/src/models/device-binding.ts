import type { DeviceStatus } from '../enums/device-status.enum';

export interface IDeviceBinding {
  id: string;
  userId: string;
  deviceFingerprint: string;
  platform: string;
  deviceModel: string | null;
  osVersion: string | null;
  isPrimary: boolean;
  status: DeviceStatus;
  registeredAt: Date;
  lastSeenAt: Date | null;
  revokedAt: Date | null;
  revokedReason: string | null;
}
