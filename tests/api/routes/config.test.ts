/**
 * Tests for PUT /common-code/:groupCode/:code endpoint.
 *
 * Covers:
 * - 200 success: updateConfig called, refreshConfig called, correct body
 * - 400 anchor rejection: AnchorModificationError → ANCHOR_GROUP_MODIFICATION_REJECTED
 * - 404 not found: ConfigNotFoundError → CONFIG_NOT_FOUND
 * - 422 invalid value: validation error → INVALID_CONFIG_VALUE
 * - 400 invalid JSON body
 * - Various group/code combinations
 *
 * All tests use DI mocks — no database required.
 */

import { describe, expect, it, mock } from "bun:test";
import { Hono } from "hono";
import type { ConfigDeps } from "../../../src/api/routes/config";
import { createConfigRoutes } from "../../../src/api/routes/config";
import {
  AnchorModificationError,
  ConfigNotFoundError,
} from "../../../src/config/index";

// ---------------------------------------------------------------------------
// Helpers: build app with DI mocks
// ---------------------------------------------------------------------------

function buildConfigApp(deps: Partial<ConfigDeps> = {}): Hono {
  const defaultDeps: ConfigDeps = {
    getConfig: mock(async () => ({
      execution_modes: {},
      trade_blocks: [],
    })),
    updateConfig: mock(async () => undefined),
    refreshConfig: mock(async () => undefined),
    ...deps,
  };
  const app = new Hono();
  app.route("/", createConfigRoutes(defaultDeps));
  return app;
}

function makeRequest(
  app: Hono,
  groupCode: string,
  code: string,
  body: unknown,
) {
  return app.request(`/common-code/${groupCode}/${code}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Tests: PUT /common-code/:groupCode/:code — success
// ---------------------------------------------------------------------------

describe("PUT /common-code/:groupCode/:code", () => {
  it("returns 200 and calls updateConfig with correct args on success", async () => {
    const updateConfig = mock(async () => undefined);
    const refreshConfig = mock(async () => undefined);
    const app = buildConfigApp({ updateConfig, refreshConfig });

    const res = await makeRequest(app, "KNN", "top_k", { value: 10 });

    expect(res.status).toBe(200);
    const calls = updateConfig.mock.calls as unknown[][];
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual(["KNN", "top_k", 10]);
  });

  it("calls refreshConfig after updateConfig on success", async () => {
    const callOrder: string[] = [];
    const updateConfig = mock(async () => { callOrder.push("update"); });
    const refreshConfig = mock(async () => { callOrder.push("refresh"); });
    const app = buildConfigApp({ updateConfig, refreshConfig });

    const res = await makeRequest(app, "KNN", "top_k", { value: 10 });

    expect(res.status).toBe(200);
    expect(callOrder).toEqual(["update", "refresh"]);
  });

  it("returns body with group, code, and value on success", async () => {
    const app = buildConfigApp();

    const res = await makeRequest(app, "KNN", "top_k", { value: 10 });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ group: "KNN", code: "top_k", value: 10 });
  });

  it("returns 200 for FEATURE_WEIGHT group with valid numeric value", async () => {
    const updateConfig = mock(async () => undefined);
    const app = buildConfigApp({ updateConfig });

    const res = await makeRequest(app, "FEATURE_WEIGHT", "w_squeeze", { value: 2.5 });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ group: "FEATURE_WEIGHT", code: "w_squeeze", value: 2.5 });
  });

  it("passes value as-is from request body to updateConfig", async () => {
    const updateConfig = mock(async () => undefined);
    const app = buildConfigApp({ updateConfig });

    await makeRequest(app, "KNN", "top_k", { value: 42 });

    const calls = updateConfig.mock.calls as unknown[][];
    expect(calls[0]?.[2]).toBe(42);
  });
});

// ---------------------------------------------------------------------------
// Tests: PUT /common-code/:groupCode/:code — ANCHOR rejection (400)
// ---------------------------------------------------------------------------

describe("PUT /common-code/ANCHOR/:code — anchor rejection", () => {
  it("returns 400 with ANCHOR_GROUP_MODIFICATION_REJECTED when updateConfig throws AnchorModificationError", async () => {
    const updateConfig = mock(async () => {
      throw new AnchorModificationError("ANCHOR");
    });
    const app = buildConfigApp({ updateConfig });

    const res = await makeRequest(app, "ANCHOR", "bb_period", { value: 20 });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("ANCHOR_GROUP_MODIFICATION_REJECTED");
    expect(body.group).toBe("ANCHOR");
  });

  it("does not call refreshConfig when anchor rejection occurs", async () => {
    const updateConfig = mock(async () => {
      throw new AnchorModificationError("ANCHOR");
    });
    const refreshConfig = mock(async () => undefined);
    const app = buildConfigApp({ updateConfig, refreshConfig });

    await makeRequest(app, "ANCHOR", "bb_period", { value: 20 });

    expect(refreshConfig.mock.calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: PUT /common-code/:groupCode/:code — not found (404)
// ---------------------------------------------------------------------------

describe("PUT /common-code/:groupCode/:code — not found", () => {
  it("returns 404 with CONFIG_NOT_FOUND when updateConfig throws ConfigNotFoundError", async () => {
    const updateConfig = mock(async () => {
      throw new ConfigNotFoundError("KNN", "missing_code");
    });
    const app = buildConfigApp({ updateConfig });

    const res = await makeRequest(app, "KNN", "missing_code", { value: 10 });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("CONFIG_NOT_FOUND");
  });

  it("does not call refreshConfig when code not found", async () => {
    const updateConfig = mock(async () => {
      throw new ConfigNotFoundError("KNN", "nonexistent");
    });
    const refreshConfig = mock(async () => undefined);
    const app = buildConfigApp({ updateConfig, refreshConfig });

    await makeRequest(app, "KNN", "nonexistent", { value: 10 });

    expect(refreshConfig.mock.calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: PUT /common-code/:groupCode/:code — invalid value (422)
// ---------------------------------------------------------------------------

describe("PUT /common-code/:groupCode/:code — invalid value", () => {
  it("returns 422 with INVALID_CONFIG_VALUE when updateConfig throws a validation Error", async () => {
    const updateConfig = mock(async () => {
      throw new Error("Invalid config value for KNN.top_k: Expected number, received string");
    });
    const app = buildConfigApp({ updateConfig });

    const res = await makeRequest(app, "KNN", "top_k", { value: "not_a_number" });

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("INVALID_CONFIG_VALUE");
    expect(typeof body.message).toBe("string");
  });

  it("does not call refreshConfig on validation failure", async () => {
    const updateConfig = mock(async () => {
      throw new Error("Invalid value");
    });
    const refreshConfig = mock(async () => undefined);
    const app = buildConfigApp({ updateConfig, refreshConfig });

    await makeRequest(app, "KNN", "top_k", { value: "bad" });

    expect(refreshConfig.mock.calls).toHaveLength(0);
  });

  it("returns 422 message containing the error text", async () => {
    const errorMsg = "Expected number, received string";
    const updateConfig = mock(async () => {
      throw new Error(errorMsg);
    });
    const app = buildConfigApp({ updateConfig });

    const res = await makeRequest(app, "KNN", "top_k", { value: "bad" });

    const body = await res.json();
    expect(body.message).toContain(errorMsg);
  });
});

// ---------------------------------------------------------------------------
// Tests: PUT /common-code/:groupCode/:code — body validation
// ---------------------------------------------------------------------------

describe("PUT /common-code/:groupCode/:code — body validation", () => {
  it("returns 400 when body is missing value field", async () => {
    const app = buildConfigApp();

    const res = await app.request("/common-code/KNN/top_k", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ other_field: 10 }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("returns 400 when body is invalid JSON", async () => {
    const app = buildConfigApp();

    const res = await app.request("/common-code/KNN/top_k", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });

    expect(res.status).toBe(400);
  });
});
