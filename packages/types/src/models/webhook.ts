export interface IWebhook {
  id: string;
  url: string;
  events: string[];
  isActive: boolean;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}
