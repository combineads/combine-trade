import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  type LogLevel,
  _reset,
  _setWriteFunctions,
  createLogger,
  getLogLevel,
  setLogLevel,
} from "../../src/core/logger";

// ─── Helpers ──────────────────────────────────────────────────────────────────

type CapturedOutput = {
  stdout: string[];
  stderr: string[];
};

function captureOutput(): CapturedOutput {
  const captured: CapturedOutput = { stdout: [], stderr: [] };
  _setWriteFunctions(
    (line: string) => captured.stdout.push(line),
    (line: string) => captured.stderr.push(line),
  );
  return captured;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("core/logger", () => {
  beforeEach(() => {
    _reset("info");
  });

  afterEach(() => {
    _reset("info");
  });

  describe("createLogger() — basic output", () => {
    it("info() outputs JSON with module, level, and event", () => {
      const captured = captureOutput();
      const log = createLogger("test");
      log.info("started");

      expect(captured.stdout).toHaveLength(1);
      const entry = JSON.parse(captured.stdout[0]!);
      expect(entry.module).toBe("test");
      expect(entry.level).toBe("info");
      expect(entry.event).toBe("started");
    });

    it("output includes ISO 8601 timestamp field", () => {
      const captured = captureOutput();
      const log = createLogger("test");
      log.info("ts-check");

      const entry = JSON.parse(captured.stdout[0]!);
      expect(typeof entry.timestamp).toBe("string");
      // ISO 8601: matches pattern like 2025-01-01T00:00:00.000Z
      expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it("each output line is valid JSON (parseable by JSON.parse)", () => {
      const captured = captureOutput();
      const log = createLogger("test");
      log.info("event-a");
      log.warn("event-b");
      log.error("event-c");

      const allLines = [...captured.stdout, ...captured.stderr];
      for (const line of allLines) {
        expect(() => JSON.parse(line)).not.toThrow();
      }
    });
  });

  describe("log level filtering", () => {
    it("debug() message is suppressed when global level is 'info'", () => {
      const captured = captureOutput();
      const log = createLogger("test");
      log.debug("should-be-hidden");

      expect(captured.stdout).toHaveLength(0);
      expect(captured.stderr).toHaveLength(0);
    });

    it("debug() message is shown when module-level override is 'debug'", () => {
      setLogLevel("db", "debug");
      const captured = captureOutput();
      const log = createLogger("db");
      log.debug("db-debug-event");

      expect(captured.stdout).toHaveLength(1);
      const entry = JSON.parse(captured.stdout[0]!);
      expect(entry.level).toBe("debug");
      expect(entry.event).toBe("db-debug-event");
    });

    it("debug() from other modules still suppressed when only one module has override", () => {
      setLogLevel("db", "debug");
      const captured = captureOutput();
      const other = createLogger("other");
      other.debug("other-debug");

      expect(captured.stdout).toHaveLength(0);
    });

    it("setLogLevel('db', 'debug') enables subsequent db logger debug messages", () => {
      const captured = captureOutput();
      const db = createLogger("db");

      // Before override: suppressed
      db.debug("before-override");
      expect(captured.stdout).toHaveLength(0);

      // Apply override
      setLogLevel("db", "debug");
      db.debug("after-override");
      expect(captured.stdout).toHaveLength(1);
      const entry = JSON.parse(captured.stdout[0]!);
      expect(entry.event).toBe("after-override");
    });

    it("error level shows only error messages", () => {
      _reset("error");
      const captured = captureOutput();
      const log = createLogger("test");

      log.debug("d");
      log.info("i");
      log.warn("w");
      log.error("e");

      expect(captured.stdout).toHaveLength(0);
      expect(captured.stderr).toHaveLength(1);
      const entry = JSON.parse(captured.stderr[0]!);
      expect(entry.level).toBe("error");
    });
  });

  describe("output routing", () => {
    it("error() writes to stderr", () => {
      const captured = captureOutput();
      const log = createLogger("test");
      log.error("something-failed");

      expect(captured.stderr).toHaveLength(1);
      expect(captured.stdout).toHaveLength(0);
      const entry = JSON.parse(captured.stderr[0]!);
      expect(entry.level).toBe("error");
    });

    it("warn() writes to stderr", () => {
      const captured = captureOutput();
      const log = createLogger("test");
      log.warn("something-suspicious");

      expect(captured.stderr).toHaveLength(1);
      expect(captured.stdout).toHaveLength(0);
      const entry = JSON.parse(captured.stderr[0]!);
      expect(entry.level).toBe("warn");
    });

    it("info() writes to stdout", () => {
      const captured = captureOutput();
      const log = createLogger("test");
      log.info("informational");

      expect(captured.stdout).toHaveLength(1);
      expect(captured.stderr).toHaveLength(0);
    });

    it("debug() writes to stdout when level permits", () => {
      _reset("debug");
      const captured = captureOutput();
      const log = createLogger("test");
      log.debug("verbose-detail");

      expect(captured.stdout).toHaveLength(1);
      expect(captured.stderr).toHaveLength(0);
    });
  });

  describe("details serialization", () => {
    it("error() with details object serializes details in JSON output", () => {
      const captured = captureOutput();
      const log = createLogger("test");
      log.error("connection-failed", { host: "localhost", port: 5432, retries: 3 });

      const entry = JSON.parse(captured.stderr[0]!);
      expect(entry.details).toEqual({ host: "localhost", port: 5432, retries: 3 });
    });

    it("info() with symbol and exchange promotes them to top-level fields", () => {
      const captured = captureOutput();
      const log = createLogger("orders");
      log.info("order-placed", { symbol: "BTCUSDT", exchange: "binance", size: "0.1" });

      const entry = JSON.parse(captured.stdout[0]!);
      expect(entry.symbol).toBe("BTCUSDT");
      expect(entry.exchange).toBe("binance");
      // size stays in details since it is not a promoted field
      expect(entry.details).toEqual({ size: "0.1" });
    });

    it("symbol and exchange do NOT appear inside details object", () => {
      const captured = captureOutput();
      const log = createLogger("test");
      log.info("event", { symbol: "ETHUSDT", exchange: "okx" });

      const entry = JSON.parse(captured.stdout[0]!);
      // details should be absent because symbol/exchange were the only keys
      expect(entry.details).toBeUndefined();
    });

    it("details is omitted when not provided", () => {
      const captured = captureOutput();
      const log = createLogger("test");
      log.info("bare-event");

      const entry = JSON.parse(captured.stdout[0]!);
      expect(entry.details).toBeUndefined();
    });

    it("details is omitted when empty after promoting symbol/exchange", () => {
      const captured = captureOutput();
      const log = createLogger("test");
      log.info("event", { symbol: "BTCUSDT" });

      const entry = JSON.parse(captured.stdout[0]!);
      expect(entry.symbol).toBe("BTCUSDT");
      expect(entry.details).toBeUndefined();
    });
  });

  describe("getLogLevel()", () => {
    it("returns global level when no module given", () => {
      _reset("warn");
      const captured = captureOutput(); // install write fns after reset
      void captured;
      expect(getLogLevel()).toBe("warn");
    });

    it("returns module override when set", () => {
      const captured = captureOutput();
      void captured;
      setLogLevel("signals", "debug");
      expect(getLogLevel("signals")).toBe("debug");
    });

    it("returns global level for module without override", () => {
      const captured = captureOutput();
      void captured;
      expect(getLogLevel("candles")).toBe("info");
    });
  });

  describe("multiple loggers independence", () => {
    it("two loggers with different modules output their own module name", () => {
      const captured = captureOutput();
      const logA = createLogger("module-a");
      const logB = createLogger("module-b");
      logA.info("event-a");
      logB.info("event-b");

      expect(captured.stdout).toHaveLength(2);
      const entryA = JSON.parse(captured.stdout[0]!);
      const entryB = JSON.parse(captured.stdout[1]!);
      expect(entryA.module).toBe("module-a");
      expect(entryB.module).toBe("module-b");
    });
  });
});
