import { describe, expect, mock, test } from "bun:test";
import type { KillSwitchAuditEvent } from "../kill-switch-audit.js";
import {
	KillSwitchNotifier,
	type KillSwitchNotifierDeps,
	buildActivationMessage,
	buildDeactivationMessage,
} from "../kill-switch-notifier.js";

function makeActivationEvent(
	overrides: Partial<KillSwitchAuditEvent> = {},
): KillSwitchAuditEvent {
	return {
		id: "audit-1",
		killSwitchStateId: "ks-1",
		triggerType: "manual",
		triggerReason: "Operator initiated emergency stop",
		scope: "global",
		scopeTarget: null,
		positionsSnapshot: [{ symbol: "BTC/USDT", size: "0.5" }, { symbol: "ETH/USDT", size: "1.0" }],
		activatedAt: new Date("2025-01-15T10:30:00.000Z"),
		deactivatedAt: null,
		deactivatedBy: null,
		...overrides,
	};
}

function makeDeactivationEvent(
	overrides: Partial<KillSwitchAuditEvent> = {},
): KillSwitchAuditEvent {
	return {
		id: "audit-2",
		killSwitchStateId: "ks-2",
		triggerType: "loss_limit",
		triggerReason: "Daily loss limit exceeded",
		scope: "exchange",
		scopeTarget: "binance",
		positionsSnapshot: [],
		activatedAt: new Date("2025-01-15T09:00:00.000Z"),
		deactivatedAt: new Date("2025-01-15T10:30:00.000Z"),
		deactivatedBy: "user-42",
		...overrides,
	};
}

describe("kill-switch-slack: buildActivationMessage", () => {
	test("includes trigger type in output blocks", () => {
		const event = makeActivationEvent({ triggerType: "loss_limit" });
		const blocks = buildActivationMessage(event);
		const text = JSON.stringify(blocks);
		expect(text).toContain("loss_limit");
	});

	test("includes trigger reason in output blocks", () => {
		const event = makeActivationEvent({ triggerReason: "Daily loss limit exceeded" });
		const blocks = buildActivationMessage(event);
		const text = JSON.stringify(blocks);
		expect(text).toContain("Daily loss limit exceeded");
	});

	test("includes scope in output blocks", () => {
		const event = makeActivationEvent({ scope: "exchange" });
		const blocks = buildActivationMessage(event);
		const text = JSON.stringify(blocks);
		expect(text).toContain("exchange");
	});

	test("includes scopeTarget when present", () => {
		const event = makeActivationEvent({ scope: "exchange", scopeTarget: "binance" });
		const blocks = buildActivationMessage(event);
		const text = JSON.stringify(blocks);
		expect(text).toContain("binance");
	});

	test("includes positions count from snapshot", () => {
		const event = makeActivationEvent({
			positionsSnapshot: [{ symbol: "BTC/USDT" }, { symbol: "ETH/USDT" }, { symbol: "SOL/USDT" }],
		});
		const blocks = buildActivationMessage(event);
		const text = JSON.stringify(blocks);
		expect(text).toContain("3");
	});

	test("includes activation timestamp formatted as ISO string", () => {
		const activatedAt = new Date("2025-01-15T10:30:00.000Z");
		const event = makeActivationEvent({ activatedAt });
		const blocks = buildActivationMessage(event);
		const text = JSON.stringify(blocks);
		expect(text).toContain("2025-01-15T10:30:00.000Z");
	});

	test("returns array of block objects", () => {
		const event = makeActivationEvent();
		const blocks = buildActivationMessage(event);
		expect(Array.isArray(blocks)).toBe(true);
		expect(blocks.length).toBeGreaterThan(0);
	});
});

describe("kill-switch-slack: buildDeactivationMessage", () => {
	test("includes deactivatedBy field", () => {
		const event = makeDeactivationEvent({ deactivatedBy: "operator-99" });
		const blocks = buildDeactivationMessage(event);
		const text = JSON.stringify(blocks);
		expect(text).toContain("operator-99");
	});

	test("includes duration when both activatedAt and deactivatedAt are set", () => {
		const event = makeDeactivationEvent({
			activatedAt: new Date("2025-01-15T09:00:00.000Z"),
			deactivatedAt: new Date("2025-01-15T10:30:00.000Z"),
		});
		const blocks = buildDeactivationMessage(event);
		const text = JSON.stringify(blocks);
		// 90 minutes duration
		expect(text).toMatch(/90|5400/);
	});

	test("includes scope in output blocks", () => {
		const event = makeDeactivationEvent({ scope: "strategy", scopeTarget: "strat-1" });
		const blocks = buildDeactivationMessage(event);
		const text = JSON.stringify(blocks);
		expect(text).toContain("strategy");
	});

	test("returns array of block objects", () => {
		const event = makeDeactivationEvent();
		const blocks = buildDeactivationMessage(event);
		expect(Array.isArray(blocks)).toBe(true);
		expect(blocks.length).toBeGreaterThan(0);
	});
});

describe("kill-switch-slack: KillSwitchNotifier", () => {
	test("notifyActivation calls sendSlackMessage exactly once", async () => {
		let callCount = 0;
		const deps: KillSwitchNotifierDeps = {
			sendSlackMessage: async () => {
				callCount++;
			},
		};
		const notifier = new KillSwitchNotifier(deps);
		await notifier.notifyActivation(makeActivationEvent());
		expect(callCount).toBe(1);
	});

	test("notifyDeactivation calls sendSlackMessage exactly once", async () => {
		let callCount = 0;
		const deps: KillSwitchNotifierDeps = {
			sendSlackMessage: async () => {
				callCount++;
			},
		};
		const notifier = new KillSwitchNotifier(deps);
		await notifier.notifyDeactivation(makeDeactivationEvent());
		expect(callCount).toBe(1);
	});

	test("notifyActivation does not throw when sendSlackMessage rejects", async () => {
		const deps: KillSwitchNotifierDeps = {
			sendSlackMessage: async () => {
				throw new Error("Slack webhook failed: 503");
			},
		};
		const notifier = new KillSwitchNotifier(deps);
		// Must resolve without throwing
		await expect(notifier.notifyActivation(makeActivationEvent())).resolves.toBeUndefined();
	});

	test("notifyDeactivation does not throw when sendSlackMessage rejects", async () => {
		const deps: KillSwitchNotifierDeps = {
			sendSlackMessage: async () => {
				throw new Error("Network error");
			},
		};
		const notifier = new KillSwitchNotifier(deps);
		await expect(notifier.notifyDeactivation(makeDeactivationEvent())).resolves.toBeUndefined();
	});

	test("notifyActivation passes blocks produced by buildActivationMessage", async () => {
		let capturedBlocks: unknown[] = [];
		const deps: KillSwitchNotifierDeps = {
			sendSlackMessage: async (blocks) => {
				capturedBlocks = blocks;
			},
		};
		const notifier = new KillSwitchNotifier(deps);
		const event = makeActivationEvent({ triggerType: "api_error" });
		await notifier.notifyActivation(event);
		expect(JSON.stringify(capturedBlocks)).toContain("api_error");
	});

	test("notifyDeactivation passes blocks produced by buildDeactivationMessage", async () => {
		let capturedBlocks: unknown[] = [];
		const deps: KillSwitchNotifierDeps = {
			sendSlackMessage: async (blocks) => {
				capturedBlocks = blocks;
			},
		};
		const notifier = new KillSwitchNotifier(deps);
		const event = makeDeactivationEvent({ deactivatedBy: "user-007" });
		await notifier.notifyDeactivation(event);
		expect(JSON.stringify(capturedBlocks)).toContain("user-007");
	});
});
