import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import {
  type SlackAlertDetails,
  SlackEventType,
  formatMessage,
  getWebhookUrl,
  sendSlackAlert,
} from "../../src/notifications/slack";

// ---------------------------------------------------------------------------
// fetch mock helpers
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch;

function mockFetchOk(): ReturnType<typeof mock> {
  const fn = mock(() => Promise.resolve(new Response("ok", { status: 200 })));
  globalThis.fetch = fn as typeof globalThis.fetch;
  return fn;
}

function mockFetchFail(): ReturnType<typeof mock> {
  const fn = mock(() => Promise.reject(new Error("network error")));
  globalThis.fetch = fn as typeof globalThis.fetch;
  return fn;
}

function mockFetchNon200(): ReturnType<typeof mock> {
  const fn = mock(() =>
    Promise.resolve(new Response("channel_not_found", { status: 404 })),
  );
  globalThis.fetch = fn as typeof globalThis.fetch;
  return fn;
}

// ---------------------------------------------------------------------------
// env helpers
// ---------------------------------------------------------------------------

const originalEnv = process.env.SLACK_WEBHOOK_URL;

function setEnvUrl(url: string | undefined): void {
  if (url === undefined) {
    delete process.env.SLACK_WEBHOOK_URL;
  } else {
    process.env.SLACK_WEBHOOK_URL = url;
  }
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  setEnvUrl(undefined);
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalEnv !== undefined) {
    process.env.SLACK_WEBHOOK_URL = originalEnv;
  } else {
    delete process.env.SLACK_WEBHOOK_URL;
  }
});

// ---------------------------------------------------------------------------
// SlackEventType enum
// ---------------------------------------------------------------------------

describe("SlackEventType", () => {
  it("has all 8 required event types", () => {
    expect(SlackEventType.ORDER_FILLED).toBe("ORDER_FILLED");
    expect(SlackEventType.SL_REGISTERED).toBe("SL_REGISTERED");
    expect(SlackEventType.SL_FAILED).toBe("SL_FAILED");
    expect(SlackEventType.RECONCILIATION_MISMATCH).toBe("RECONCILIATION_MISMATCH");
    expect(SlackEventType.LOSS_LIMIT_HIT).toBe("LOSS_LIMIT_HIT");
    expect(SlackEventType.DAEMON_START).toBe("DAEMON_START");
    expect(SlackEventType.DAEMON_STOP).toBe("DAEMON_STOP");
    expect(SlackEventType.CRASH_RECOVERY).toBe("CRASH_RECOVERY");
  });
});

// ---------------------------------------------------------------------------
// getWebhookUrl
// ---------------------------------------------------------------------------

describe("getWebhookUrl", () => {
  it("returns env value when SLACK_WEBHOOK_URL is set", async () => {
    setEnvUrl("https://hooks.slack.com/services/T/B/xxx");
    const url = await getWebhookUrl();
    expect(url).toBe("https://hooks.slack.com/services/T/B/xxx");
  });

  it("returns null when neither env nor db is configured", async () => {
    setEnvUrl(undefined);
    const url = await getWebhookUrl();
    expect(url).toBeNull();
  });

  it("env takes precedence over db parameter", async () => {
    setEnvUrl("https://hooks.slack.com/from-env");
    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([{ value: "https://hooks.slack.com/from-db" }]),
        }),
      }),
    };
    const url = await getWebhookUrl(mockDb as unknown as Parameters<typeof getWebhookUrl>[0]);
    expect(url).toBe("https://hooks.slack.com/from-env");
  });
});

// ---------------------------------------------------------------------------
// formatMessage
// ---------------------------------------------------------------------------

describe("formatMessage", () => {
  it("ORDER_FILLED produces green color with symbol/price/size fields", () => {
    const payload = formatMessage(SlackEventType.ORDER_FILLED, {
      symbol: "BTCUSDT",
      exchange: "binance",
      price: "50000.00",
      size: "0.1",
      side: "BUY",
    });

    expect(payload.attachments).toBeDefined();
    expect(payload.attachments![0]!.color).toBe("#2eb886");
    // Check blocks exist
    expect(payload.blocks).toBeDefined();
    expect(payload.blocks!.length).toBeGreaterThanOrEqual(1);
    // Verify the payload contains the symbol in some form
    const bodyStr = JSON.stringify(payload);
    expect(bodyStr).toContain("BTCUSDT");
    expect(bodyStr).toContain("50000.00");
    expect(bodyStr).toContain("0.1");
  });

  it("RECONCILIATION_MISMATCH produces red color", () => {
    const payload = formatMessage(SlackEventType.RECONCILIATION_MISMATCH, {
      action: "ALERT",
      unmatchedCount: "3",
      orphanedCount: "1",
    });

    expect(payload.attachments![0]!.color).toBe("#e01e5a");
    const bodyStr = JSON.stringify(payload);
    expect(bodyStr).toContain("RECONCILIATION_MISMATCH");
  });

  it("LOSS_LIMIT_HIT produces orange color", () => {
    const payload = formatMessage(SlackEventType.LOSS_LIMIT_HIT, {
      violationType: "daily",
      symbol: "ETHUSDT",
      exchange: "okx",
    });

    expect(payload.attachments![0]!.color).toBe("#f2c744");
    const bodyStr = JSON.stringify(payload);
    expect(bodyStr).toContain("ETHUSDT");
  });

  it("SL_FAILED produces red color", () => {
    const payload = formatMessage(SlackEventType.SL_FAILED, {
      symbol: "BTCUSDT",
      exchange: "binance",
      error: "insufficient margin",
    });

    expect(payload.attachments![0]!.color).toBe("#e01e5a");
  });

  it("SL_REGISTERED produces green color", () => {
    const payload = formatMessage(SlackEventType.SL_REGISTERED, {
      symbol: "BTCUSDT",
      exchange: "binance",
      slPrice: "49000.00",
    });

    expect(payload.attachments![0]!.color).toBe("#2eb886");
  });

  it("DAEMON_START produces green color", () => {
    const payload = formatMessage(SlackEventType.DAEMON_START, {
      version: "0.1.0",
    });

    expect(payload.attachments![0]!.color).toBe("#2eb886");
  });

  it("DAEMON_STOP produces orange color", () => {
    const payload = formatMessage(SlackEventType.DAEMON_STOP, {
      reason: "manual",
    });

    expect(payload.attachments![0]!.color).toBe("#f2c744");
  });

  it("CRASH_RECOVERY produces red color", () => {
    const payload = formatMessage(SlackEventType.CRASH_RECOVERY, {
      error: "uncaught exception",
      ticketsRecovered: "2",
    });

    expect(payload.attachments![0]!.color).toBe("#e01e5a");
  });

  it("includes timestamp in the payload", () => {
    const payload = formatMessage(SlackEventType.DAEMON_START, {});

    const bodyStr = JSON.stringify(payload);
    // Should contain a timestamp-like pattern (ISO or Unix)
    expect(payload.blocks).toBeDefined();
    // At least one block should have a context with timestamp
    const contextBlocks = payload.blocks!.filter(
      (b: Record<string, unknown>) => b.type === "context",
    );
    expect(contextBlocks.length).toBeGreaterThanOrEqual(1);
  });

  it("all event types produce a valid message (no missing formatter)", () => {
    const allTypes = Object.values(SlackEventType);
    for (const eventType of allTypes) {
      const payload = formatMessage(eventType, {});
      expect(payload.blocks).toBeDefined();
      expect(payload.attachments).toBeDefined();
      expect(payload.attachments!.length).toBeGreaterThanOrEqual(1);
    }
  });
});

// ---------------------------------------------------------------------------
// sendSlackAlert
// ---------------------------------------------------------------------------

describe("sendSlackAlert", () => {
  it("with valid URL calls fetch with POST and correct payload", async () => {
    setEnvUrl("https://hooks.slack.com/services/T/B/test");
    const fetchMock = mockFetchOk();

    await sendSlackAlert(SlackEventType.ORDER_FILLED, {
      symbol: "BTCUSDT",
      exchange: "binance",
      price: "50000",
      size: "0.1",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = (fetchMock as ReturnType<typeof mock>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://hooks.slack.com/services/T/B/test");
    expect(options.method).toBe("POST");
    expect(options.headers).toEqual({ "Content-Type": "application/json" });

    // Verify body is valid JSON with blocks
    const body = JSON.parse(options.body as string);
    expect(body.blocks).toBeDefined();
    expect(body.attachments).toBeDefined();
  });

  it("with no URL configured returns without error and no fetch call", async () => {
    setEnvUrl(undefined);
    const fetchMock = mockFetchOk();

    // Should not throw
    await sendSlackAlert(SlackEventType.DAEMON_START, {});

    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it("fetch throws does not propagate error", async () => {
    setEnvUrl("https://hooks.slack.com/services/T/B/test");
    mockFetchFail();

    // Must not throw
    await expect(
      sendSlackAlert(SlackEventType.SL_FAILED, { symbol: "BTCUSDT" }),
    ).resolves.toBeUndefined();
  });

  it("fetch returns non-200 does not throw", async () => {
    setEnvUrl("https://hooks.slack.com/services/T/B/test");
    mockFetchNon200();

    // Must not throw
    await expect(
      sendSlackAlert(SlackEventType.RECONCILIATION_MISMATCH, { action: "ALERT" }),
    ).resolves.toBeUndefined();
  });

  it("is truly fire-and-forget — returns void", async () => {
    setEnvUrl("https://hooks.slack.com/services/T/B/test");
    mockFetchOk();

    const result = await sendSlackAlert(SlackEventType.DAEMON_START, {});
    expect(result).toBeUndefined();
  });
});
