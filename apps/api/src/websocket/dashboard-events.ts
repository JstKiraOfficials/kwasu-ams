/**
 * @file dashboard-events.ts
 * @module websocket
 *
 * WebSocket handler for real-time dashboard events.
 *
 * Clients connect to `GET /ws/dashboard?token=<jwt>` to receive live
 * dashboard updates. The JWT is passed as a query parameter because browser
 * WebSocket APIs cannot set custom headers.
 *
 * Event types published to `dashboard:{userId}:events`:
 * - `ATTENDANCE_RATE_CHANGED` — `{ courseId, newRate, trend }` — session closed.
 * - `ANOMALY_FLAGGED`         — `{ anomalyId, flagType, studentName }` — anomaly created.
 * - `ELIGIBILITY_UPDATED`     — `{ studentId, courseId, newStatus }` — eligibility computed.
 * - `SESSION_OPENED`          — `{ sessionId, courseCode, venue }` — session opened.
 *
 * A dedicated Redis subscriber connection is created per WebSocket connection
 * and destroyed on disconnect (ioredis does not allow commands on a subscribed
 * connection).
 */

import { type FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import { verifyAccessToken } from '../lib/jwt.js';
import { isOk } from '@kwasu-ams/utils';
import { redisConfig } from '../config/redis.js';

/**
 * Registers the WebSocket route for real-time dashboard events.
 *
 * Route: `GET /ws/dashboard?token=<jwt>`
 *
 * Authentication: JWT passed as `?token=` query parameter.
 * Closes with code 4001 if the token is missing or invalid.
 *
 * On connection:
 * - Verifies the JWT and extracts `userId`.
 * - Creates a dedicated Redis subscriber connection.
 * - Subscribes to `dashboard:{userId}:events`.
 * - Forwards all Redis messages to the WebSocket client as JSON strings.
 *
 * On disconnect:
 * - Unsubscribes and quits the dedicated Redis subscriber connection.
 *
 * @param app - The Fastify application instance (must have `@fastify/websocket` registered).
 */
export function registerDashboardWebSocket(app: FastifyInstance): void {
  app.get('/ws/dashboard', { websocket: true }, (socket, request) => {
    const query = request.query as { token?: string };
    const token = query.token;

    // Verify JWT — close with 4001 if missing or invalid
    if (!token) {
      socket.close(4001, 'Authentication required.');
      return;
    }

    const result = verifyAccessToken(token);
    if (!isOk(result)) {
      socket.close(4001, 'Invalid or expired token.');
      return;
    }

    const { userId } = result.value;
    const channel = `dashboard:${userId}:events`;

    // Create a dedicated subscriber Redis connection for this WebSocket
    const subscriber = new Redis(redisConfig.url, {
      password: redisConfig.password ?? undefined,
      lazyConnect: false,
      maxRetriesPerRequest: 3,
    });

    void subscriber.subscribe(channel);

    // Forward Redis messages to the WebSocket client
    subscriber.on('message', (_channel: string, message: string) => {
      if (socket.readyState === socket.OPEN) {
        socket.send(message);
      }
    });

    // Clean up on WebSocket disconnect
    socket.on('close', () => {
      void subscriber.unsubscribe(channel);
      void subscriber.quit();
    });

    // Handle subscriber errors gracefully
    subscriber.on('error', () => {
      socket.close(1011, 'Internal server error.');
    });
  });
}
