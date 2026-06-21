/**
 * Structured logging. Use `createLogger('Feature')` — never `console.*` directly
 * (see AGENTS.md). A global sink (wired by sentry.ts) forwards logs to observability.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogSink = (
  level: LogLevel,
  namespace: string,
  message: string,
  detail?: unknown,
) => void;

let globalSink: LogSink | null = null;

/** Wire a global sink (e.g. Sentry). Pass null to detach. */
export function setGlobalLogSink(sink: LogSink | null): void {
  globalSink = sink;
}

export interface Logger {
  debug(message: string, detail?: unknown): void;
  info(message: string, detail?: unknown): void;
  warn(message: string, detail?: unknown): void;
  error(message: string, detail?: unknown): void;
}

const isDev = import.meta.env.DEV;

export function createLogger(namespace: string): Logger {
  const emit = (level: LogLevel, message: string, detail?: unknown): void => {
    if (globalSink) globalSink(level, namespace, message, detail);
    if (isDev) {
      const line = `[${namespace}] ${message}`;
      if (level === 'error') console.error(line, detail ?? '');
      else if (level === 'warn') console.warn(line, detail ?? '');
      else console.log(line, detail ?? '');
    }
  };
  return {
    debug: (message, detail) => emit('debug', message, detail),
    info: (message, detail) => emit('info', message, detail),
    warn: (message, detail) => emit('warn', message, detail),
    error: (message, detail) => emit('error', message, detail),
  };
}
