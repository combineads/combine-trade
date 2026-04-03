// ─── Types ────────────────────────────────────────────────────────────────────

export type LogLevel = "error" | "warn" | "info" | "debug";

export type LogDetails = {
  symbol?: string;
  exchange?: string;
  [key: string]: unknown;
};

export type Logger = {
  error(event: string, details?: LogDetails): void;
  warn(event: string, details?: LogDetails): void;
  info(event: string, details?: LogDetails): void;
  debug(event: string, details?: LogDetails): void;
};

// ─── Internal types ────────────────────────────────────────────────────────────

type LogEntry = {
  timestamp: string;
  level: LogLevel;
  module: string;
  event: string;
  symbol?: string;
  exchange?: string;
  details?: Record<string, unknown>;
};

/** Writable function used for output — injectable for testing */
export type WriteFn = (line: string) => void;

// ─── Level ordering ────────────────────────────────────────────────────────────

const LEVEL_ORDER: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

// ─── State ────────────────────────────────────────────────────────────────────

/** Global baseline log level — read from LOG_LEVEL env var, default 'info' */
let globalLevel: LogLevel = parseLevel(process.env.LOG_LEVEL, "info");

/** Per-module overrides — populated at startup from LOG_LEVEL_<MODULE> env vars */
const moduleOverrides: Map<string, LogLevel> = new Map<string, LogLevel>();

/** Injectable write functions (set once for testing; default to process streams) */
let stdoutWrite: WriteFn = (line: string) => process.stdout.write(`${line}\n`);
let stderrWrite: WriteFn = (line: string) => process.stderr.write(`${line}\n`);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseLevel(raw: string | undefined, fallback: LogLevel): LogLevel {
  if (raw === "error" || raw === "warn" || raw === "info" || raw === "debug") {
    return raw;
  }
  return fallback;
}

function resolveLevel(module: string): LogLevel {
  const override = moduleOverrides.get(module);
  if (override !== undefined) {
    return override;
  }
  return globalLevel;
}

function shouldLog(level: LogLevel, module: string): boolean {
  const effective = resolveLevel(module);
  return LEVEL_ORDER[level] <= LEVEL_ORDER[effective];
}

function buildEntry(
  level: LogLevel,
  module: string,
  event: string,
  details?: LogDetails,
): LogEntry {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    module,
    event,
  };

  if (details !== undefined) {
    const { symbol, exchange, ...rest } = details;

    if (symbol !== undefined) {
      entry.symbol = symbol;
    }
    if (exchange !== undefined) {
      entry.exchange = exchange;
    }

    // Only set details if there are remaining keys
    const restKeys = Object.keys(rest);
    if (restKeys.length > 0) {
      entry.details = rest;
    }
  }

  return entry;
}

function emit(level: LogLevel, entry: LogEntry): void {
  const line = JSON.stringify(entry);
  if (level === "error" || level === "warn") {
    stderrWrite(line);
  } else {
    stdoutWrite(line);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Creates a module-scoped logger. All methods are synchronous.
 */
export function createLogger(module: string): Logger {
  return {
    error(event: string, details?: LogDetails): void {
      if (shouldLog("error", module)) {
        emit("error", buildEntry("error", module, event, details));
      }
    },
    warn(event: string, details?: LogDetails): void {
      if (shouldLog("warn", module)) {
        emit("warn", buildEntry("warn", module, event, details));
      }
    },
    info(event: string, details?: LogDetails): void {
      if (shouldLog("info", module)) {
        emit("info", buildEntry("info", module, event, details));
      }
    },
    debug(event: string, details?: LogDetails): void {
      if (shouldLog("debug", module)) {
        emit("debug", buildEntry("debug", module, event, details));
      }
    },
  };
}

/**
 * Sets a per-module log level at runtime.
 */
export function setLogLevel(module: string, level: LogLevel): void {
  moduleOverrides.set(module, level);
}

/**
 * Returns the effective log level for a module (or the global level when
 * module is omitted).
 */
export function getLogLevel(module?: string): LogLevel {
  if (module !== undefined) {
    const override = moduleOverrides.get(module);
    if (override !== undefined) {
      return override;
    }
  }
  return globalLevel;
}

/**
 * Overrides the write functions used for stdout and stderr.
 * Intended for testing only — do not call in production code.
 */
export function _setWriteFunctions(stdout: WriteFn, stderr: WriteFn): void {
  stdoutWrite = stdout;
  stderrWrite = stderr;
}

/**
 * Resets the logger state to defaults. Intended for testing only.
 */
export function _reset(level: LogLevel = "info"): void {
  globalLevel = level;
  moduleOverrides.clear();
  stdoutWrite = (line: string) => process.stdout.write(`${line}\n`);
  stderrWrite = (line: string) => process.stderr.write(`${line}\n`);
}

// ─── Bootstrap module-level env overrides ────────────────────────────────────

// Read LOG_LEVEL_<MODULE>=<level> env vars at module load time.
// Module names are uppercased in the env var key.
for (const [key, value] of Object.entries(process.env)) {
  if (key.startsWith("LOG_LEVEL_") && key.length > "LOG_LEVEL_".length) {
    const moduleName = key.slice("LOG_LEVEL_".length).toLowerCase();
    const level = parseLevel(value, "info");
    moduleOverrides.set(moduleName, level);
  }
}
