/**
 * Logger mínimo con nivel configurable.
 *
 * Los mensajes de diagnóstico usan `debug`; la operación normal usa `info`.
 * `silent` desactiva toda salida y se usa en tests.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

export interface Logger {
  readonly level: LogLevel;
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  child(scope: string): Logger;
}

export function parseLogLevel(value: string | undefined, fallback: LogLevel = 'info'): LogLevel {
  if (value === undefined || value.trim() === '') {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  return normalized in LEVEL_WEIGHT ? (normalized as LogLevel) : fallback;
}

class ConsoleLogger implements Logger {
  constructor(
    readonly level: LogLevel,
    private readonly scope: string,
  ) {}

  debug(...args: unknown[]): void {
    this.write('debug', console.debug, args);
  }

  info(...args: unknown[]): void {
    this.write('info', console.info, args);
  }

  warn(...args: unknown[]): void {
    this.write('warn', console.warn, args);
  }

  error(...args: unknown[]): void {
    this.write('error', console.error, args);
  }

  child(scope: string): Logger {
    return new ConsoleLogger(this.level, `${this.scope}:${scope}`);
  }

  private write(
    level: Exclude<LogLevel, 'silent'>,
    method: (...args: unknown[]) => void,
    args: unknown[],
  ): void {
    if (LEVEL_WEIGHT[this.level] > LEVEL_WEIGHT[level]) {
      return;
    }
    method(`[${this.scope}]`, ...args);
  }
}

export function createLogger(scope: string, level: LogLevel = 'info'): Logger {
  return new ConsoleLogger(level, scope);
}
