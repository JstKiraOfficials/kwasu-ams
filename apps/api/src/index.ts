import { createApp } from './app.js';
import { connectRedis, redis } from './lib/redis.js';
import { prisma } from './lib/prisma.js';
import { env } from './config/env.js';

async function main(): Promise<void> {
  // Connect to Redis before starting the server
  await connectRedis();

  const app = await createApp();

  // Start listening
  await app.listen({ port: env.API_PORT, host: '0.0.0.0' });
  app.log.info(`KWASU AMS API running on port ${env.API_PORT}`);

  // ── Graceful shutdown ─────────────────────────────────────────────────────
  const shutdown = async (signal: string): Promise<void> => {
    app.log.info(`Received ${signal} — shutting down gracefully`);
    try {
      await app.close();
      await prisma.$disconnect();
      await redis.quit();
      app.log.info('Shutdown complete');
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
