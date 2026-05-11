import 'fastify';
import { type Role } from '@kwasu-ams/types';

declare module 'fastify' {
  interface FastifyRequest {
    user:
      | {
          userId: string;
          role: Role;
          scopeId: string | null;
          sessionId: string;
        }
      | undefined;
  }
}
