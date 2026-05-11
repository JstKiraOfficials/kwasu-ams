import pino, { type Logger } from 'pino';
import { env } from '../config/env.js';

/** Creates a structured Pino logger configured for the current environment. */
export function createLogger(): Logger {
  const isDev = env.NODE_ENV === 'development';

  return pino({
    level: isDev ? 'debug' : 'info',
    ...(isDev
      ? {
          transport: {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'SYS:standard',
              ignore: 'pid,hostname',
            },
          },
        }
      : {}),
  });
}
