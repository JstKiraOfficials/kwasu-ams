import fp from 'fastify-plugin';
import cors from '@fastify/cors';
import { type FastifyInstance } from 'fastify';
import { env } from '../config/env.js';

export default fp(async function corsPlugin(app: FastifyInstance): Promise<void> {
  const allowedOrigins = env.CORS_ORIGINS.split(',').map((s) => s.trim());

  await app.register(cors, {
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
});
