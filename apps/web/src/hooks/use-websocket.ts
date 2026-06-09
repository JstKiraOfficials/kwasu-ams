/**
 * @file use-websocket.ts
 * @module hooks/use-websocket
 *
 * WebSocket hook for real-time session and dashboard event subscriptions.
 *
 * Connects to `NEXT_PUBLIC_WS_URL` with the current access token as a query
 * parameter (`?token=...`). Automatically reconnects on close (with a 3-second
 * backoff), and disconnects cleanly on component unmount.
 *
 * Messages are dispatched to the `onMessage` callback as parsed JSON. If
 * parsing fails, the raw message string is passed through as-is.
 */

import { useEffect, useRef, useCallback } from 'react';
import { getAccessToken } from '../lib/auth';

const WS_URL = process.env['NEXT_PUBLIC_WS_URL'] ?? 'ws://localhost:3001';

/** Reconnect delay in milliseconds after an unexpected socket close. */
const RECONNECT_DELAY_MS = 3_000;

/**
 * Options accepted by `useWebSocket`.
 */
export interface UseWebSocketOptions {
  /**
   * WebSocket channel path, appended to `NEXT_PUBLIC_WS_URL`
   * (e.g. `'/sessions/abc123/live'`).
   */
  path: string;
  /**
   * Called with each parsed message received from the server.
   *
   * @param data - The parsed JSON payload, or the raw string if parsing fails.
   */
  onMessage: (data: unknown) => void;
  /**
   * When `false`, the socket is not opened. Useful for conditionally enabling
   * real-time updates (e.g. only when a session is active).
   *
   * Defaults to `true`.
   */
  enabled?: boolean;
}

/**
 * Subscribes to a WebSocket channel and calls `onMessage` on every event.
 *
 * The access token is appended as `?token=<jwt>` to authenticate the
 * connection (the API validates this on the WebSocket handshake).
 *
 * Reconnects automatically after `RECONNECT_DELAY_MS` on unexpected closure.
 * Cleans up the socket and any pending reconnect timer on unmount.
 *
 * @param options - `UseWebSocketOptions` configuring the path, callback, and enabled flag.
 */
export function useWebSocket({ path, onMessage, enabled = true }: UseWebSocketOptions): void {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onMessageRef = useRef(onMessage);

  // Keep onMessage ref current without re-triggering the effect
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  const connect = useCallback(() => {
    const token = getAccessToken();
    const url = `${WS_URL}${path}${token ? `?token=${token}` : ''}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onmessage = (event: MessageEvent) => {
      try {
        const parsed: unknown = JSON.parse(event.data as string);
        onMessageRef.current(parsed);
      } catch {
        onMessageRef.current(event.data);
      }
    };

    ws.onclose = (event: CloseEvent) => {
      // 1000 = normal closure, 1001 = going away — don't reconnect
      if (event.code !== 1000 && event.code !== 1001) {
        reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY_MS);
      }
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [path]);

  useEffect(() => {
    if (!enabled) return;

    connect();

    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close(1000, 'component unmounted');
    };
  }, [enabled, connect]);
}
