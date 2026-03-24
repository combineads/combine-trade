import { describe, expect, test } from "bun:test";
import enMessages from "../src/i18n/messages/en.json";
import koMessages from "../src/i18n/messages/ko.json";
import { EN_TERMS, KO_TERMS, UNTRANSLATED_TERMS } from "../src/i18n/glossary";

// Helper: collect all leaf key paths from a nested object
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

describe("i18n common namespace — structural parity", () => {
	const enKeys = collectKeyPaths(enMessages).sort();
	const koKeys = collectKeyPaths(koMessages).sort();

	test("ko.json and en.json have identical key sets", () => {
		expect(koKeys).toEqual(enKeys);
	});

	test("ko.json has a common namespace", () => {
		expect(koMessages).toHaveProperty("common");
	});

	test("en.json has a common namespace", () => {
		expect(enMessages).toHaveProperty("common");
	});

	test("both files have identical top-level namespaces", () => {
		const enTopLevel = Object.keys(enMessages).sort();
		const koTopLevel = Object.keys(koMessages).sort();
		expect(koTopLevel).toEqual(enTopLevel);
	});
});

describe("i18n common namespace — section completeness", () => {
	const en = enMessages.common;
	const ko = koMessages.common;

	test("nav section has all required navigation labels", () => {
		const requiredNavKeys = [
			"dashboard",
			"strategies",
			"orders",
			"alerts",
			"settings",
			"journal",
			"backtest",
			"charts",
			"events",
			"risk",
		];
		for (const key of requiredNavKeys) {
			expect(en.nav).toHaveProperty(key);
			expect(ko.nav).toHaveProperty(key);
		}
	});

	test("actions section has all required action buttons", () => {
		const requiredActions = [
			"save",
			"cancel",
			"delete",
			"edit",
			"create",
			"close",
			"confirm",
			"reset",
			"refresh",
		];
		for (const key of requiredActions) {
			expect(en.actions).toHaveProperty(key);
			expect(ko.actions).toHaveProperty(key);
		}
	});

	test("status section has all required status labels", () => {
		const requiredStatuses = [
			"active",
			"inactive",
			"pending",
			"running",
			"stopped",
			"error",
			"success",
			"warning",
		];
		for (const key of requiredStatuses) {
			expect(en.status).toHaveProperty(key);
			expect(ko.status).toHaveProperty(key);
		}
	});

	test("trading section has all required trading terms", () => {
		const requiredTrading = [
			"strategy",
			"position",
			"order",
			"balance",
			"symbol",
			"pnl",
			"stopLoss",
			"takeProfit",
			"killSwitch",
			"paperTrading",
		];
		for (const key of requiredTrading) {
			expect(en.trading).toHaveProperty(key);
			expect(ko.trading).toHaveProperty(key);
		}
	});

	test("error section has all required error messages", () => {
		const requiredErrors = [
			"generic",
			"network",
			"notFound",
			"unauthorized",
			"serverError",
			"invalidCredentials",
			"sessionExpired",
			"loadFailed",
		];
		for (const key of requiredErrors) {
			expect(en.error).toHaveProperty(key);
			expect(ko.error).toHaveProperty(key);
		}
	});

	test("confirm section has delete and killSwitch dialogs", () => {
		expect(en.confirm).toHaveProperty("delete");
		expect(en.confirm).toHaveProperty("killSwitch");
		expect(ko.confirm).toHaveProperty("delete");
		expect(ko.confirm).toHaveProperty("killSwitch");
	});

	test("empty section covers all entity types", () => {
		const requiredEmpty = [
			"generic",
			"noData",
			"noResults",
			"noStrategies",
			"noOrders",
			"noAlerts",
		];
		for (const key of requiredEmpty) {
			expect(en.empty).toHaveProperty(key);
			expect(ko.empty).toHaveProperty(key);
		}
	});

	test("form section has name, description, email, password labels", () => {
		expect(en.form).toHaveProperty("name");
		expect(en.form).toHaveProperty("description");
		expect(en.form).toHaveProperty("email");
		expect(en.form).toHaveProperty("password");
		expect(ko.form).toHaveProperty("name");
		expect(ko.form).toHaveProperty("description");
		expect(ko.form).toHaveProperty("email");
		expect(ko.form).toHaveProperty("password");
	});
});

describe("i18n common namespace — translation value checks", () => {
	const en = enMessages.common;
	const ko = koMessages.common;

	test("LONG/SHORT/PASS trading directions are identical in both locales (domain standard)", () => {
		expect(en.trading.long).toBe("LONG");
		expect(ko.trading.long).toBe("LONG");
		expect(en.trading.short).toBe("SHORT");
		expect(ko.trading.short).toBe("SHORT");
		expect(en.trading.pass).toBe("PASS");
		expect(ko.trading.pass).toBe("PASS");
	});

	test("PnL term is preserved in both locales", () => {
		expect(en.trading.pnl).toBe("PnL");
		expect(ko.trading.pnl).toBe("PnL");
	});

	test("ko translations are non-empty strings", () => {
		const koPaths = collectKeyPaths(koMessages);
		for (const path of koPaths) {
			const parts = path.split(".");
			let value: unknown = koMessages;
			for (const part of parts) {
				value = (value as Record<string, unknown>)[part];
			}
			expect(typeof value).toBe("string");
			expect((value as string).length).toBeGreaterThan(0);
		}
	});

	test("en translations are non-empty strings", () => {
		const enPaths = collectKeyPaths(enMessages);
		for (const path of enPaths) {
			const parts = path.split(".");
			let value: unknown = enMessages;
			for (const part of parts) {
				value = (value as Record<string, unknown>)[part];
			}
			expect(typeof value).toBe("string");
			expect((value as string).length).toBeGreaterThan(0);
		}
	});

	test("ko and en translations differ for non-domain nav labels", () => {
		// These labels should be translated, not the same in both
		expect(en.nav.dashboard).not.toBe(ko.nav.dashboard);
		expect(en.nav.strategies).not.toBe(ko.nav.strategies);
		expect(en.nav.settings).not.toBe(ko.nav.settings);
	});

	test("ko and en action labels differ", () => {
		expect(en.actions.save).not.toBe(ko.actions.save);
		expect(en.actions.cancel).not.toBe(ko.actions.cancel);
		expect(en.actions.delete).not.toBe(ko.actions.delete);
	});

	test("killSwitch confirm dialogs have title, message, confirm, cancel keys", () => {
		const dialogKeys = ["title", "message", "confirm", "cancel"];
		for (const key of dialogKeys) {
			expect(en.confirm.killSwitch.activate).toHaveProperty(key);
			expect(en.confirm.killSwitch.deactivate).toHaveProperty(key);
			expect(ko.confirm.killSwitch.activate).toHaveProperty(key);
			expect(ko.confirm.killSwitch.deactivate).toHaveProperty(key);
		}
	});

	test("notification.killSwitchActive matches existing hardcoded banner text in English", () => {
		// The English text should match what was previously hardcoded in notification-banner.tsx
		expect(en.notification.killSwitchActive).toBe(
			"Kill Switch Active — All trading is halted",
		);
	});
});

describe("glossary — term consistency", () => {
	test("glossary KO_TERMS and EN_TERMS have the same keys", () => {
		const koKeys = Object.keys(KO_TERMS).sort();
		const enKeys = Object.keys(EN_TERMS).sort();
		expect(koKeys).toEqual(enKeys);
	});

	test("UNTRANSLATED_TERMS includes LONG, SHORT, PASS", () => {
		expect(UNTRANSLATED_TERMS).toContain("LONG");
		expect(UNTRANSLATED_TERMS).toContain("SHORT");
		expect(UNTRANSLATED_TERMS).toContain("PASS");
	});

	test("glossary ko trading terms match ko.json trading translations", () => {
		const ko = koMessages.common;
		expect(KO_TERMS.strategy).toBe(ko.trading.strategy);
		expect(KO_TERMS.position).toBe(ko.trading.position);
		expect(KO_TERMS.stopLoss).toBe(ko.trading.stopLoss);
		expect(KO_TERMS.takeProfit).toBe(ko.trading.takeProfit);
		expect(KO_TERMS.killSwitch).toBe(ko.trading.killSwitch);
		expect(KO_TERMS.paperTrading).toBe(ko.trading.paperTrading);
	});

	test("glossary en trading terms match en.json trading translations", () => {
		const en = enMessages.common;
		expect(EN_TERMS.strategy).toBe(en.trading.strategy);
		expect(EN_TERMS.position).toBe(en.trading.position);
		expect(EN_TERMS.stopLoss).toBe(en.trading.stopLoss);
		expect(EN_TERMS.takeProfit).toBe(en.trading.takeProfit);
		expect(EN_TERMS.killSwitch).toBe(en.trading.killSwitch);
		expect(EN_TERMS.paperTrading).toBe(en.trading.paperTrading);
	});

	test("glossary nav terms match json nav translations", () => {
		const ko = koMessages.common;
		const en = enMessages.common;
		expect(KO_TERMS.dashboard).toBe(ko.nav.dashboard);
		expect(KO_TERMS.strategies).toBe(ko.nav.strategies);
		expect(EN_TERMS.dashboard).toBe(en.nav.dashboard);
		expect(EN_TERMS.strategies).toBe(en.nav.strategies);
	});
});
