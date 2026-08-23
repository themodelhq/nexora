/**
 * Nexora — structured logger (JSON lines for operational observability).
 * Logs API errors, blockchain errors, auth failures, and request metadata.
 */
import { randomUUID } from 'crypto';

type Level = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  ts: string;
  level: Level;
  requestId?: string;
  event: string;
  [k: string]: unknown;
}

function emit(level: Level, event: string, fields: Record<string, unknown> = {}): void {
  const entry: LogEntry = { ts: new Date().toISOString(), level, event, ...fields };
  const line = JSON.stringify(entry);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (event: string, fields?: Record<string, unknown>) => emit('debug', event, fields),
  info: (event: string, fields?: Record<string, unknown>) => emit('info', event, fields),
  warn: (event: string, fields?: Record<string, unknown>) => emit('warn', event, fields),
  error: (event: string, fields?: Record<string, unknown>) => emit('error', event, fields),
  /** Attach a request id to a middleware-flow logger. */
  withRequest: (requestId: string) => ({
    info: (event: string, fields?: Record<string, unknown>) => emit('info', event, { requestId, ...fields }),
    warn: (event: string, fields?: Record<string, unknown>) => emit('warn', event, { requestId, ...fields }),
    error: (event: string, fields?: Record<string, unknown>) => emit('error', event, { requestId, ...fields }),
  }),
  newRequestId: () => randomUUID(),
};
