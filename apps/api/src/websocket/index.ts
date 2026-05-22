/**
 * @file index.ts
 * @module websocket
 *
 * WebSocket module entry point.
 *
 * Registers all WebSocket routes on the Fastify instance.
 * Must be called after `@fastify/websocket` plugin is registered.
 */

import { type FastifyInstance } from 'fastify';
import { registerSessionWebSocket } from './session-events.js';
import { registerDashboardWebSocket } from './dashboard-events.js';

/**
 * Registers all WebSocket routes on the provided Fastify instance.
 *
 * Currently registers:
 * - `GET /ws/sessions/:id/live` — real-time session check-in events.
 * - `GET /ws/dashboard`         — real-time dashboard events.
 *
 * @param app - The Fastify application instance with `@fastify/websocket` registered.
 */
export function registerWebSocketRoutes(app: FastifyInstance): void {
  registerSessionWebSocket(app);
  registerDashboardWebSocket(app);
}
