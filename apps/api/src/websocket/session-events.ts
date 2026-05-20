/**
 * @file session-events.ts
 * @module websocket
 *
 * WebSocket handler for real-time session check-in events.
 *
 * Clients connect to `GET /ws/sessions/:id/live?token=<jwt>` to receive
 * live check-in events as students mark attendance. The JWT is passed as a
 * query parameter because browser WebSocket APIs cannot set custom headers.
 *
 * Event flow:
 * 1. Client connects with a valid JWT query param.
 * 2. Server subscribes to Redis channel `session:{sessionId}:checkins`.
 * 3. Check-in service (Phase 19) publishes events to this channel.
 * 4. Server forwards events to the WebSocket client.
 * 5. On session close, server sends `SESSION_CLOSED` event and closes connection.
 * 6. On client disconnect, server unsubscribes from Redis channel.
 *
 * Redis pub/sub requires a dedicated subscriber connection (ioredis does not
 * allow commands on a connection in subscribe mode). A new Redis instance is
 * created per WebSocket connection and destroyed on disconnect.
 */

import { type FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import { verifyAccessToken } from '../lib/jwt.js';
import { isOk } from '@kwasu-ams/utils';
import { redisConfig } from '../config/redis.js';

/**
 * Registers the WebSocket route for live session check-in events.
 *
 * Route: `GET /ws/sessions/:id/live?token=<jwt>`
 *
 * Authentication: JWT passed as `?token=` query parameter (required because
 * browser WebSocket APIs cannot set custom headers).
 *
 * On connection:
 * - Verifies the JWT. Closes with code 4001 if invalid.
 * - Creates a dedicated Redis subscriber connection.
 * - Subscribes to `session:{sessionId}:checkins` and `session:{sessionId}:lifecycle`.
 * - Forwards all Redis messages to the WebSocket client as JSON strings.
 *
 * On disconnect:
 * - Unsubscribes and quits the dedicated Redis subscriber connection.
 *
 * @param app - The Fastify application instance (must have `@fastify/websocket` registered).
 */
export function registerSessionWebSocket(app: FastifyInstance): void {
  app.get('/ws/sessions/:id/live', { websocket: true }, (socket, request) => {
    const { id: sessionId } = request.params as { id: string };
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

    // Create a dedicated subscriber Redis connection for this WebSocket
    const subscriber = new Redis(redisConfig.url, {
      password: redisConfig.password ?? undefined,
      lazyConnect: false,
      maxRetriesPerRequest: 3,
    });

    const checkinChannel = `session:${sessionId}:checkins`;
    const lifecycleChannel = `session:${sessionId}:lifecycle`;

    // Subscribe to both channels
    void subscriber.subscribe(checkinChannel, lifecycleChannel);

    // Forward Redis messages to the WebSocket client
    subscriber.on('message', (channel: string, message: string) => {
      if (socket.readyState === socket.OPEN) {
        socket.send(message);

        // Close connection when session is closed
        try {
          const parsed = JSON.parse(message) as { event?: string };
          if (parsed.event === 'SESSION_CLOSED') {
            socket.close(1000, 'Session closed.');
          }
        } catch {
          // Ignore malformed messages
        }
      }
    });

    // Clean up on WebSocket disconnect
    socket.on('close', () => {
      void subscriber.unsubscribe(checkinChannel, lifecycleChannel);
      void subscriber.quit();
    });

    // Handle subscriber errors gracefully
    subscriber.on('error', () => {
      socket.close(1011, 'Internal server error.');
    });
  });
}
