import type { NotificationChannel, NotificationStatus } from '../enums/notification-channel.enum';

export interface INotification {
  id: string;
  recipientId: string;
  channel: NotificationChannel;
  templateKey: string;
  language: string;
  subject: string | null;
  body: string;
  status: NotificationStatus;
  externalId: string | null;
  failureReason: string | null;
  sentAt: Date | null;
  deliveredAt: Date | null;
  createdAt: Date;
}
