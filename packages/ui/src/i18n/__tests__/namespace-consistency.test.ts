import { describe, expect, it } from "bun:test";
import enMessages from "../messages/en.json";
import koMessages from "../messages/ko.json";

/** Recursively collect all dot-path keys from an object */
function collectKeys(obj: Record<string, unknown>, prefix = ""): string[] {
	const keys: string[] = [];
	for (const [k, v] of Object.entries(obj)) {
		const path = prefix ? `${prefix}.${k}` : k;
		if (v !== null && typeof v === "object") {
			keys.push(...collectKeys(v as Record<string, unknown>, path));
		} else {
			keys.push(path);
		}
	}
	return keys.sort();
}

const NEW_NAMESPACES = ["auth", "backtest", "events", "charts"] as const;

describe("new i18n namespaces — ko/en consistency", () => {
	for (const ns of NEW_NAMESPACES) {
		it(`${ns}: namespace exists in ko.json`, () => {
			expect(koMessages).toHaveProperty(ns);
		});

		it(`${ns}: namespace exists in en.json`, () => {
			expect(enMessages).toHaveProperty(ns);
		});

		it(`${ns}: ko and en have identical key structure`, () => {
			const ko = (koMessages as Record<string, unknown>)[ns] as Record<string, unknown>;
			const en = (enMessages as Record<string, unknown>)[ns] as Record<string, unknown>;
			const koKeys = collectKeys(ko);
			const enKeys = collectKeys(en);
			expect(koKeys).toEqual(enKeys);
		});

		it(`${ns}: all values are non-empty strings`, () => {
			const assertNonEmpty = (obj: Record<string, unknown>, path: string) => {
				for (const [key, value] of Object.entries(obj)) {
					const fullPath = `${path}.${key}`;
					if (typeof value === "object" && value !== null) {
						assertNonEmpty(value as Record<string, unknown>, fullPath);
					} else {
						expect(typeof value, `${fullPath} should be string`).toBe("string");
						expect((value as string).length, `${fullPath} should be non-empty`).toBeGreaterThan(0);
					}
				}
			};
			const ko = (koMessages as Record<string, unknown>)[ns] as Record<string, unknown>;
			const en = (enMessages as Record<string, unknown>)[ns] as Record<string, unknown>;
			assertNonEmpty(ko, `ko.${ns}`);
			assertNonEmpty(en, `en.${ns}`);
		});
	}
});

describe("auth namespace — required keys", () => {
	const requiredKeys = [
		"login", "logout", "signIn", "signingIn", "username", "email",
		"password", "keepLoggedIn", "loginFailed", "sessionExpired", "loginAgain", "unauthorized",
	];

	for (const key of requiredKeys) {
		it(`ko.auth.${key} exists`, () => {
			expect(koMessages.auth).toHaveProperty(key);
		});
		it(`en.auth.${key} exists`, () => {
			expect(enMessages.auth).toHaveProperty(key);
		});
	}
});

describe("backtest namespace — required keys", () => {
	const requiredTopKeys = ["pageTitle", "runBacktest", "running", "startDate", "endDate", "strategy", "noStrategies"];
	const requiredStatKeys = ["totalTrades", "winRate", "maxDrawdown", "sharpeRatio", "expectancy", "profitFactor"];

	for (const key of requiredTopKeys) {
		it(`ko.backtest.${key} exists`, () => {
			expect(koMessages.backtest).toHaveProperty(key);
		});
	}

	for (const key of requiredStatKeys) {
		it(`ko.backtest.stats.${key} exists`, () => {
			expect(koMessages.backtest.stats).toHaveProperty(key);
		});
		it(`en.backtest.stats.${key} exists`, () => {
			expect(enMessages.backtest.stats).toHaveProperty(key);
		});
	}
});

describe("events namespace — required keys", () => {
	const columnKeys = ["symbol", "direction", "strategy", "winrate", "decision", "date"];

	it("ko.events.pageTitle exists", () => {
		expect(koMessages.events).toHaveProperty("pageTitle");
	});

	it("en.events.noEvents exists", () => {
		expect(enMessages.events).toHaveProperty("noEvents");
	});

	for (const key of columnKeys) {
		it(`ko.events.columns.${key} exists`, () => {
			expect(koMessages.events.columns).toHaveProperty(key);
		});
	}
});

describe("charts namespace — required keys", () => {
	const timeframeKeys = ["1m", "5m", "15m", "1h", "4h", "1d"];

	it("ko.charts.candlestick exists", () => {
		expect(koMessages.charts).toHaveProperty("candlestick");
	});

	it("en.charts.fullscreen exists", () => {
		expect(enMessages.charts).toHaveProperty("fullscreen");
	});

	for (const tf of timeframeKeys) {
		it(`ko.charts.timeframes.${tf} exists`, () => {
			expect(koMessages.charts.timeframes).toHaveProperty(tf);
		});
		it(`en.charts.timeframes.${tf} exists`, () => {
			expect(enMessages.charts.timeframes).toHaveProperty(tf);
		});
	}
});

describe("charts timeframe locale difference", () => {
	it("ko uses full Korean names for timeframes", () => {
		expect(koMessages.charts.timeframes["1m"]).toBe("1분");
		expect(koMessages.charts.timeframes["1h"]).toBe("1시간");
		expect(koMessages.charts.timeframes["1d"]).toBe("1일");
	});

	it("en uses short abbreviations for timeframes", () => {
		expect(enMessages.charts.timeframes["1m"]).toBe("1m");
		expect(enMessages.charts.timeframes["1h"]).toBe("1h");
		expect(enMessages.charts.timeframes["1d"]).toBe("1d");
	});
});
