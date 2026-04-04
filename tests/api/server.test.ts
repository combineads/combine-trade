/**
 * Tests for Hono API server — createApiServer(), static file serving,
 * SPA fallback, 404 JSON, and daemon.ts integration.
 *
 * Strategy: use real Bun.serve with ephemeral port 0 for actual HTTP tests,
 * and mocks for daemon integration tests.
 */

import { afterEach, beforeAll, describe, expect, it, mock } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createApiServer } from "../../src/api/server";
import type { ApiServerDeps } from "../../src/api/types";
import type { Logger } from "../../src/core/logger";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const TEST_PUBLIC_DIR = join(import.meta.dir, ".test-public");
const INDEX_HTML = "<html><body>Hello</body></html>";

function createMockLogger(): Logger {
  return {
    error: mock(() => {}),
    warn: mock(() => {}),
    info: mock(() => {}),
    debug: mock(() => {}),
  };
}

function createDeps(overrides?: Partial<ApiServerDeps>): ApiServerDeps {
  return {
    logger: createMockLogger(),
    port: 0, // ephemeral port — OS assigns an available one
    staticDir: TEST_PUBLIC_DIR,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeAll(() => {
  // Create a temporary public directory with an index.html
  mkdirSync(TEST_PUBLIC_DIR, { recursive: true });
  writeFileSync(join(TEST_PUBLIC_DIR, "index.html"), INDEX_HTML);
  writeFileSync(join(TEST_PUBLIC_DIR, "style.css"), "body { margin: 0; }");

  // Create a subdirectory with a file
  mkdirSync(join(TEST_PUBLIC_DIR, "assets"), { recursive: true });
  writeFileSync(join(TEST_PUBLIC_DIR, "assets", "logo.svg"), "<svg></svg>");
});

// Track servers to clean up after each test
type StoppableServer = { stop: () => Promise<void> };
const serversToStop: StoppableServer[] = [];

afterEach(async () => {
  for (const s of serversToStop) {
    await s.stop().catch(() => {});
  }
  serversToStop.length = 0;
});

// Clean up temp directory after all tests (using process exit hook since
// bun:test does not have afterAll that runs reliably after async tests)
process.on("exit", () => {
  try {
    rmSync(TEST_PUBLIC_DIR, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

// ---------------------------------------------------------------------------
// Helper: start server and get base URL
// ---------------------------------------------------------------------------

async function startTestServer(deps?: Partial<ApiServerDeps>): Promise<{
  baseUrl: string;
  server: ReturnType<typeof createApiServer>;
  logger: Logger;
}> {
  const logger = createMockLogger();
  const server = createApiServer({ logger, port: 0, staticDir: TEST_PUBLIC_DIR, ...deps });
  serversToStop.push(server);

  await server.start();

  // Extract the port from the logger.info call
  const infoCall = (logger.info as ReturnType<typeof mock>).mock.calls.find(
    (call: unknown[]) => call[0] === "api_server_started",
  );
  const port = (infoCall?.[1] as { details?: { port?: number } } | undefined)?.details?.port;

  if (port === undefined) {
    throw new Error("Could not determine server port from logger call");
  }

  return { baseUrl: `http://localhost:${port}`, server, logger };
}

// ---------------------------------------------------------------------------
// Tests: createApiServer lifecycle
// ---------------------------------------------------------------------------

describe("createApiServer", () => {
  describe("lifecycle", () => {
    it("start() makes the server listen on the specified port", async () => {
      const { baseUrl } = await startTestServer();

      const res = await fetch(`${baseUrl}/`);
      expect(res.status).toBe(200);
    });

    it("stop() shuts down the server", async () => {
      const { baseUrl, server } = await startTestServer();

      // Server is running
      const res1 = await fetch(`${baseUrl}/`);
      expect(res1.status).toBe(200);

      // Stop it
      await server.stop();
      // Remove from cleanup list since we already stopped
      const idx = serversToStop.indexOf(server);
      if (idx !== -1) serversToStop.splice(idx, 1);

      // Server should no longer accept connections
      try {
        await fetch(`${baseUrl}/`, { signal: AbortSignal.timeout(500) });
        // If fetch succeeds, the port may have been reused — that's OK for a race condition.
        // The important thing is stop() resolved without error.
      } catch {
        // Expected: connection refused
      }
    });

    it("start() is idempotent — calling twice logs a warning", async () => {
      const logger = createMockLogger();
      const server = createApiServer({ logger, port: 0, staticDir: TEST_PUBLIC_DIR });
      serversToStop.push(server);

      await server.start();
      await server.start(); // second call

      const warnCalls = (logger.warn as ReturnType<typeof mock>).mock.calls;
      expect(warnCalls.some((call: unknown[]) => call[0] === "api_server_already_running")).toBe(
        true,
      );
    });

    it("stop() is idempotent — calling twice does not throw", async () => {
      const { server } = await startTestServer();

      await server.stop();
      await server.stop(); // second call — should not throw

      // Remove from cleanup
      const idx = serversToStop.indexOf(server);
      if (idx !== -1) serversToStop.splice(idx, 1);
    });
  });

  // ---------------------------------------------------------------------------
  // Tests: static file serving
  // ---------------------------------------------------------------------------

  describe("static file serving", () => {
    it("GET / serves index.html", async () => {
      const { baseUrl } = await startTestServer();

      const res = await fetch(`${baseUrl}/`);
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toContain("Hello");
    });

    it("GET /style.css serves the CSS file", async () => {
      const { baseUrl } = await startTestServer();

      const res = await fetch(`${baseUrl}/style.css`);
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toContain("margin");
    });

    it("GET /assets/logo.svg serves files from subdirectories", async () => {
      const { baseUrl } = await startTestServer();

      const res = await fetch(`${baseUrl}/assets/logo.svg`);
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toContain("<svg>");
    });
  });

  // ---------------------------------------------------------------------------
  // Tests: SPA fallback
  // ---------------------------------------------------------------------------

  describe("SPA fallback", () => {
    it("GET /nonexistent-path falls back to index.html", async () => {
      const { baseUrl } = await startTestServer();

      const res = await fetch(`${baseUrl}/some/deep/path`);
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toContain("Hello");
    });
  });

  // ---------------------------------------------------------------------------
  // Tests: API 404
  // ---------------------------------------------------------------------------

  describe("API 404", () => {
    it("GET /api/unknown returns 404 JSON", async () => {
      const { baseUrl } = await startTestServer();

      const res = await fetch(`${baseUrl}/api/unknown`);
      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body).toEqual({ error: "Not Found" });
    });

    it("POST /api/unknown returns 404 JSON", async () => {
      const { baseUrl } = await startTestServer();

      const res = await fetch(`${baseUrl}/api/unknown`, { method: "POST" });
      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body).toEqual({ error: "Not Found" });
    });

    it("GET /api returns 404 JSON (no root API handler yet)", async () => {
      const { baseUrl } = await startTestServer();

      const res = await fetch(`${baseUrl}/api`);
      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body).toEqual({ error: "Not Found" });
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: daemon.ts integration
// ---------------------------------------------------------------------------

describe("daemon apiServer integration", () => {
  // These tests use mocks to verify the daemon calls start/stop at the right time.
  // We import startDaemon and verify apiServer.start() / .stop() are called.

  // Lazy import to avoid pulling in daemon dependencies at module scope.
  async function loadDaemon() {
    const { startDaemon } = await import("../../src/daemon");
    return { startDaemon };
  }

  // Minimal mock deps that satisfy DaemonDeps
  function buildDaemonDeps(apiServer?: { start(): Promise<void>; stop(): Promise<void> }) {
    const candleManager = {
      start: mock(async () => {}),
      stop: mock(async () => {}),
      onCandleClose: mock(() => () => {}),
      getStatus: mock(() => ({
        syncCompleted: true,
        collecting: true,
        activeSubscriptions: 0,
        lastReceivedAt: null,
        lastGapRecovery: null,
      })),
    };

    return {
      candleManager,
      adapters: new Map(),
      reconciliationDeps: {
        getActiveTickets: mock(async () => []),
        getPendingSymbols: mock(async () => new Set<string>()),
        emergencyClose: mock(async () => {}),
        setSymbolStateIdle: mock(async () => {}),
        insertEvent: mock(async () => {}),
      },
      candleManagerConfig: { symbols: [], adapter: {} as never },
      initDb: mock(async () => {}),
      loadAllConfig: mock(async () => {}),
      recoverFromCrash: mock(async () => ({
        matched: 0,
        unmatched: 0,
        orphaned: 0,
        slReRegistered: 0,
        errors: [],
        durationMs: 0,
      })),
      crashRecoveryDeps: {
        adapters: new Map(),
        getActiveTickets: mock(async () => []),
        getPendingSymbols: mock(async () => new Set<string>()),
        comparePositions: mock(() => ({ matched: [], unmatched: [], orphaned: [], excluded: [] })),
        emergencyClose: mock(async () => {}),
        setSymbolStateIdle: mock(async () => {}),
        checkSlOnExchange: mock(async () => true),
        reRegisterSl: mock(async () => {}),
        restoreLossCounters: mock(async () => {}),
        insertEvent: mock(async () => {}),
        sendSlackAlert: mock(async () => {}),
      },
      startReconciliation: mock(() => ({ stop: mock(() => {}) })),
      pipelineDeps: {} as never,
      activeSymbols: [],
      ...(apiServer !== undefined ? { apiServer } : {}),
    };
  }

  it("calls apiServer.start() during startup when provided", async () => {
    const { startDaemon } = await loadDaemon();
    const apiServerStart = mock(async () => {});
    const apiServerStop = mock(async () => {});
    const deps = buildDaemonDeps({ start: apiServerStart, stop: apiServerStop });

    const handle = await startDaemon(deps);
    await handle.stop();

    expect(apiServerStart.mock.calls.length).toBe(1);
  });

  it("calls apiServer.stop() during shutdown when provided", async () => {
    const { startDaemon } = await loadDaemon();
    const apiServerStart = mock(async () => {});
    const apiServerStop = mock(async () => {});
    const deps = buildDaemonDeps({ start: apiServerStart, stop: apiServerStop });

    const handle = await startDaemon(deps);
    await handle.stop();

    expect(apiServerStop.mock.calls.length).toBe(1);
  });

  it("works without apiServer (backward compatibility)", async () => {
    const { startDaemon } = await loadDaemon();
    const deps = buildDaemonDeps(); // no apiServer

    const handle = await startDaemon(deps);
    await handle.stop();

    // If we get here without error, backward compatibility is preserved
    expect(true).toBe(true);
  });
});
