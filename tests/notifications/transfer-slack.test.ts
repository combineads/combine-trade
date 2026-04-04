import { describe, expect, it } from "bun:test";
import { SlackEventType, formatMessage } from "../../src/notifications/slack";

// ---------------------------------------------------------------------------
// Transfer SlackEventType — T-14-006
// ---------------------------------------------------------------------------

describe("SlackEventType transfer entries", () => {
  it("TRANSFER_SUCCESS value is correct string literal", () => {
    expect(SlackEventType.TRANSFER_SUCCESS).toBe("TRANSFER_SUCCESS");
  });

  it("TRANSFER_FAILED value is correct string literal", () => {
    expect(SlackEventType.TRANSFER_FAILED).toBe("TRANSFER_FAILED");
  });

  it("TRANSFER_SKIP value is correct string literal", () => {
    expect(SlackEventType.TRANSFER_SKIP).toBe("TRANSFER_SKIP");
  });

  it("TRANSFER_SURPLUS_ALERT value is correct string literal", () => {
    expect(SlackEventType.TRANSFER_SURPLUS_ALERT).toBe("TRANSFER_SURPLUS_ALERT");
  });

  it("existing ORDER_FILLED is unchanged (regression)", () => {
    expect(SlackEventType.ORDER_FILLED).toBe("ORDER_FILLED");
  });
});

describe("formatMessage transfer events", () => {
  it("TRANSFER_SUCCESS produces green color (#2eb886) and money_with_wings emoji", () => {
    const payload = formatMessage(SlackEventType.TRANSFER_SUCCESS, {
      amount: "250",
      exchange: "binance",
    });

    expect(payload.attachments).toBeDefined();
    expect(payload.attachments![0]!.color).toBe("#2eb886");

    const bodyStr = JSON.stringify(payload);
    expect(bodyStr).toContain(":money_with_wings:");
    expect(bodyStr).toContain("250");
    expect(bodyStr).toContain("binance");
  });

  it("TRANSFER_FAILED produces red color (#e01e5a) and rotating_light emoji", () => {
    const payload = formatMessage(SlackEventType.TRANSFER_FAILED, {
      error: "insufficient_balance",
    });

    expect(payload.attachments![0]!.color).toBe("#e01e5a");

    const bodyStr = JSON.stringify(payload);
    expect(bodyStr).toContain(":rotating_light:");
    expect(bodyStr).toContain("insufficient_balance");
  });

  it("TRANSFER_SKIP produces orange color (#f2c744) and fast_forward emoji", () => {
    const payload = formatMessage(SlackEventType.TRANSFER_SKIP, {
      exchange: "okx",
      reason: "below_threshold",
    });

    expect(payload.attachments![0]!.color).toBe("#f2c744");

    const bodyStr = JSON.stringify(payload);
    expect(bodyStr).toContain(":fast_forward:");
  });

  it("TRANSFER_SURPLUS_ALERT produces orange color (#f2c744) and mega emoji", () => {
    const payload = formatMessage(SlackEventType.TRANSFER_SURPLUS_ALERT, {
      exchange: "okx",
      amount: "500",
    });

    expect(payload.attachments![0]!.color).toBe("#f2c744");

    const bodyStr = JSON.stringify(payload);
    expect(bodyStr).toContain(":mega:");
    expect(bodyStr).toContain("500");
    expect(bodyStr).toContain("okx");
  });

  it("all transfer event types produce a valid payload with blocks and attachments", () => {
    const transferTypes = [
      SlackEventType.TRANSFER_SUCCESS,
      SlackEventType.TRANSFER_FAILED,
      SlackEventType.TRANSFER_SKIP,
      SlackEventType.TRANSFER_SURPLUS_ALERT,
    ] as const;

    for (const eventType of transferTypes) {
      const payload = formatMessage(eventType, {});
      expect(payload.blocks).toBeDefined();
      expect(payload.attachments).toBeDefined();
      expect(payload.attachments!.length).toBeGreaterThanOrEqual(1);
    }
  });
});
