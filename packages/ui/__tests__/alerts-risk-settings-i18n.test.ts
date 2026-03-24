/**
 * Namespace consistency tests for alerts, risk, and settings namespaces.
 * Verifies that ko.json and en.json have identical key structures.
 */

import { describe, expect, test } from "bun:test";
import enMessages from "../src/i18n/messages/en.json";
import koMessages from "../src/i18n/messages/ko.json";

// ── Helpers ────────────────────────────────────────────────────────────────

function collectKeyPaths(obj: Record<string, unknown>, prefix = ""): string[] {
	const paths: string[] = [];
	for (const [key, value] of Object.entries(obj)) {
		const path = prefix ? `${prefix}.${key}` : key;
		if (value !== null && typeof value === "object" && !Array.isArray(value)) {
			paths.push(...collectKeyPaths(value as Record<string, unknown>, path));
		} else {
			paths.push(path);
		}
	}
	return paths;
}

// ── alerts namespace ───────────────────────────────────────────────────────

describe("alerts namespace — structural parity", () => {
	test("ko.json has alerts namespace", () => {
		expect(koMessages).toHaveProperty("alerts");
	});

	test("en.json has alerts namespace", () => {
		expect(enMessages).toHaveProperty("alerts");
	});

	test("ko and en alerts namespace have identical key sets", () => {
		const koKeys = collectKeyPaths(koMessages.alerts as Record<string, unknown>).sort();
		const enKeys = collectKeyPaths(enMessages.alerts as Record<string, unknown>).sort();
		expect(koKeys).toEqual(enKeys);
	});

	test("alerts namespace has pageTitle key", () => {
		expect(enMessages.alerts).toHaveProperty("pageTitle");
		expect(koMessages.alerts).toHaveProperty("pageTitle");
	});

	test("alerts namespace has required alert type keys", () => {
		const requiredKeys = ["priceAlert", "signalAlert", "killSwitchAlert", "lossLimitAlert", "liquidationAlert"];
		for (const key of requiredKeys) {
			expect(enMessages.alerts).toHaveProperty(key);
			expect(koMessages.alerts).toHaveProperty(key);
		}
	});

	test("alerts namespace has severity sub-keys", () => {
		const severityKeys = ["info", "warning", "critical"];
		for (const key of severityKeys) {
			expect(enMessages.alerts.severity).toHaveProperty(key);
			expect(koMessages.alerts.severity).toHaveProperty(key);
		}
	});

	test("alerts namespace has columns sub-keys", () => {
		const columnKeys = ["symbol", "direction", "strategy", "message", "status", "date"];
		for (const key of columnKeys) {
			expect(enMessages.alerts.columns).toHaveProperty(key);
			expect(koMessages.alerts.columns).toHaveProperty(key);
		}
	});

	test("alerts namespace has actions sub-keys", () => {
		const actionKeys = ["acknowledge", "dismiss", "viewDetails"];
		for (const key of actionKeys) {
			expect(enMessages.alerts.actions).toHaveProperty(key);
			expect(koMessages.alerts.actions).toHaveProperty(key);
		}
	});

	test("alerts pageTitle differs between locales", () => {
		expect(enMessages.alerts.pageTitle).not.toBe(koMessages.alerts.pageTitle);
	});

	test("en alerts pageTitle is 'Alerts'", () => {
		expect(enMessages.alerts.pageTitle).toBe("Alerts");
	});

	test("ko alerts pageTitle is '알림'", () => {
		expect(koMessages.alerts.pageTitle).toBe("알림");
	});
});

// ── risk namespace ─────────────────────────────────────────────────────────

describe("risk namespace — structural parity", () => {
	test("ko.json has risk namespace", () => {
		expect(koMessages).toHaveProperty("risk");
	});

	test("en.json has risk namespace", () => {
		expect(enMessages).toHaveProperty("risk");
	});

	test("ko and en risk namespace have identical key sets", () => {
		const koKeys = collectKeyPaths(koMessages.risk as Record<string, unknown>).sort();
		const enKeys = collectKeyPaths(enMessages.risk as Record<string, unknown>).sort();
		expect(koKeys).toEqual(enKeys);
	});

	test("risk namespace has pageTitle key", () => {
		expect(enMessages.risk).toHaveProperty("pageTitle");
		expect(koMessages.risk).toHaveProperty("pageTitle");
	});

	test("risk namespace has killSwitch sub-keys", () => {
		const killSwitchKeys = [
			"label",
			"statusArmed",
			"statusTriggered",
			"tradingActive",
			"allTradingHalted",
			"activateButton",
			"releaseButton",
			"shortcut",
		];
		for (const key of killSwitchKeys) {
			expect(enMessages.risk.killSwitch).toHaveProperty(key);
			expect(koMessages.risk.killSwitch).toHaveProperty(key);
		}
	});

	test("risk namespace has lossLimit sub-keys", () => {
		const lossLimitKeys = ["label", "currentLoss", "limit", "exceeded", "haltAutoTrade", "emergencyLiquidation", "setLimit"];
		for (const key of lossLimitKeys) {
			expect(enMessages.risk.lossLimit).toHaveProperty(key);
			expect(koMessages.risk.lossLimit).toHaveProperty(key);
		}
	});

	test("risk namespace has auditLog sub-keys", () => {
		const auditLogKeys = ["label", "empty"];
		for (const key of auditLogKeys) {
			expect(enMessages.risk.auditLog).toHaveProperty(key);
			expect(koMessages.risk.auditLog).toHaveProperty(key);
		}
	});

	test("kill switch ARMED/TRIGGERED labels are identical in both locales (domain standard)", () => {
		expect(enMessages.risk.killSwitch.statusArmed).toBe("ARMED");
		expect(koMessages.risk.killSwitch.statusArmed).toBe("ARMED");
		expect(enMessages.risk.killSwitch.statusTriggered).toBe("TRIGGERED");
		expect(koMessages.risk.killSwitch.statusTriggered).toBe("TRIGGERED");
	});

	test("en risk pageTitle is 'Risk Management'", () => {
		expect(enMessages.risk.pageTitle).toBe("Risk Management");
	});

	test("ko risk pageTitle is '리스크 관리'", () => {
		expect(koMessages.risk.pageTitle).toBe("리스크 관리");
	});
});

// ── settings namespace ─────────────────────────────────────────────────────

describe("settings namespace — structural parity", () => {
	test("ko.json has settings namespace", () => {
		expect(koMessages).toHaveProperty("settings");
	});

	test("en.json has settings namespace", () => {
		expect(enMessages).toHaveProperty("settings");
	});

	test("ko and en settings namespace have identical key sets", () => {
		const koKeys = collectKeyPaths(koMessages.settings as Record<string, unknown>).sort();
		const enKeys = collectKeyPaths(enMessages.settings as Record<string, unknown>).sort();
		expect(koKeys).toEqual(enKeys);
	});

	test("settings namespace has pageTitle key", () => {
		expect(enMessages.settings).toHaveProperty("pageTitle");
		expect(koMessages.settings).toHaveProperty("pageTitle");
	});

	test("settings namespace has sections sub-keys", () => {
		const sectionKeys = ["appearance", "general", "language", "notifications", "exchange", "security"];
		for (const key of sectionKeys) {
			expect(enMessages.settings.sections).toHaveProperty(key);
			expect(koMessages.settings.sections).toHaveProperty(key);
		}
	});

	test("settings namespace has account, apiKey, theme, logout keys", () => {
		const requiredKeys = ["account", "apiKey", "theme", "logout"];
		for (const key of requiredKeys) {
			expect(enMessages.settings).toHaveProperty(key);
			expect(koMessages.settings).toHaveProperty(key);
		}
	});

	test("en settings pageTitle is 'Settings'", () => {
		expect(enMessages.settings.pageTitle).toBe("Settings");
	});

	test("ko settings pageTitle is '설정'", () => {
		expect(koMessages.settings.pageTitle).toBe("설정");
	});

	test("settings pageTitle differs between locales", () => {
		expect(enMessages.settings.pageTitle).not.toBe(koMessages.settings.pageTitle);
	});
});

// ── cross-namespace structural integrity ───────────────────────────────────

describe("all namespaces — structural integrity", () => {
	test("ko.json and en.json have identical top-level namespace keys", () => {
		const koTopLevel = Object.keys(koMessages).sort();
		const enTopLevel = Object.keys(enMessages).sort();
		expect(koTopLevel).toEqual(enTopLevel);
	});

	test("all message values are non-empty strings", () => {
		function assertNonEmpty(obj: Record<string, unknown>, path: string) {
			for (const [key, value] of Object.entries(obj)) {
				const fullPath = `${path}.${key}`;
				if (typeof value === "object" && value !== null) {
					assertNonEmpty(value as Record<string, unknown>, fullPath);
				} else {
					expect(typeof value, `${fullPath} should be string`).toBe("string");
					expect((value as string).length, `${fullPath} should be non-empty`).toBeGreaterThan(0);
				}
			}
		}
		assertNonEmpty(koMessages.alerts as Record<string, unknown>, "ko.alerts");
		assertNonEmpty(enMessages.alerts as Record<string, unknown>, "en.alerts");
		assertNonEmpty(koMessages.risk as Record<string, unknown>, "ko.risk");
		assertNonEmpty(enMessages.risk as Record<string, unknown>, "en.risk");
		assertNonEmpty(koMessages.settings as Record<string, unknown>, "ko.settings");
		assertNonEmpty(enMessages.settings as Record<string, unknown>, "en.settings");
	});
});
