import { describe, expect, test } from "bun:test";
import en from "../src/i18n/messages/en.json";
import ko from "../src/i18n/messages/ko.json";
import { getTranslations } from "../src/i18n";
const useTranslations = getTranslations;

// ---------------------------------------------------------------------------
// Helper: collect all dot-path keys in an object
// ---------------------------------------------------------------------------
function collectKeys(obj: unknown, prefix = ""): string[] {
	if (typeof obj !== "object" || obj === null) return [prefix];
	const result: string[] = [];
	for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
		const path = prefix ? `${prefix}.${k}` : k;
		if (typeof v === "object" && v !== null) {
			result.push(...collectKeys(v, path));
		} else {
			result.push(path);
		}
	}
	return result;
}

describe("strategies i18n namespace — structure", () => {
	test("ko.json has strategies namespace", () => {
		expect(ko).toHaveProperty("strategies");
	});

	test("en.json has strategies namespace", () => {
		expect(en).toHaveProperty("strategies");
	});

	test("ko and en have identical strategies keys", () => {
		const koKeys = collectKeys(ko.strategies).sort();
		const enKeys = collectKeys(en.strategies).sort();
		expect(koKeys).toEqual(enKeys);
	});
});

describe("strategies i18n namespace — key presence", () => {
	const requiredKeys = [
		"pageTitle",
		"createStrategy",
		"editStrategy",
		"deleteStrategy",
		"activateStrategy",
		"deactivateStrategy",
		"runBacktest",
		"saveStrategy",
		"cancelAction",
		"backAction",
		"empty.title",
		"empty.description",
		"fields.name",
		"fields.description",
		"fields.symbol",
		"fields.symbols",
		"fields.timeframe",
		"fields.timeframes",
		"fields.version",
		"fields.status",
		"fields.direction",
		"fields.mode",
		"status.active",
		"status.inactive",
		"status.draft",
		"status.backtesting",
		"form.namePlaceholder",
		"form.symbolsPlaceholder",
		"form.creating",
		"editor.codePanel",
		"editor.configPanel",
		"editor.statusBar.language",
		"editor.statusBar.encoding",
		"config.basicInfo",
		"config.features",
		"config.searchConfig",
		"config.resultConfig",
		"config.decisionConfig",
		"config.executionMode",
		"config.topK",
		"config.similarityThreshold",
		"config.minSamples",
		"config.takeProfitPct",
		"config.stopLossPct",
		"config.maxHoldBars",
		"config.minWinrate",
		"config.minExpectancy",
		"stats.winrate",
		"stats.expectancy",
		"stats.samples",
		"stats.events",
		"stats.avgHold",
		"events.tabTitle",
		"events.loading",
		"events.empty",
		"events.columns.direction",
		"events.columns.symbol",
		"events.columns.entry",
		"events.columns.exit",
		"events.columns.pnl",
		"events.columns.outcome",
		"events.columns.time",
		"version.label",
		"version.newVersion",
		"version.versionHistory",
		"version.currentVersion",
		"modes.analysis",
		"modes.alert",
		"modes.paperTrade",
		"modes.autoTrade",
	];

	for (const key of requiredKeys) {
		test(`en has key: ${key}`, () => {
			const t = useTranslations("strategies", "en");
			// biome-ignore lint/suspicious/noExplicitAny: testing key resolution
			const value = t(key as any);
			// Should not fall back to the raw key path (which means key was missing)
			expect(value).not.toBe(key);
			expect(typeof value).toBe("string");
			expect(value.length).toBeGreaterThan(0);
		});

		test(`ko has key: ${key}`, () => {
			const t = useTranslations("strategies", "ko");
			// biome-ignore lint/suspicious/noExplicitAny: testing key resolution
			const value = t(key as any);
			expect(value).not.toBe(key);
			expect(typeof value).toBe("string");
			expect(value.length).toBeGreaterThan(0);
		});
	}
});

describe("strategies i18n namespace — translation values", () => {
	test("en pageTitle is 'Strategies'", () => {
		const t = useTranslations("strategies", "en");
		expect(t("pageTitle")).toBe("Strategies");
	});

	test("ko pageTitle is '전략'", () => {
		const t = useTranslations("strategies", "ko");
		expect(t("pageTitle")).toBe("전략");
	});

	test("en createStrategy is 'Create Strategy'", () => {
		const t = useTranslations("strategies", "en");
		expect(t("createStrategy")).toBe("Create Strategy");
	});

	test("ko createStrategy is '전략 생성'", () => {
		const t = useTranslations("strategies", "ko");
		expect(t("createStrategy")).toBe("전략 생성");
	});

	test("en status.active is 'Active'", () => {
		const t = useTranslations("strategies", "en");
		expect(t("status.active")).toBe("Active");
	});

	test("ko status.active is '활성'", () => {
		const t = useTranslations("strategies", "ko");
		expect(t("status.active")).toBe("활성");
	});

	test("en config.takeProfitPct is 'Take Profit %'", () => {
		const t = useTranslations("strategies", "en");
		expect(t("config.takeProfitPct")).toBe("Take Profit %");
	});

	test("ko config.takeProfitPct is '익절 %'", () => {
		const t = useTranslations("strategies", "ko");
		expect(t("config.takeProfitPct")).toBe("익절 %");
	});

	test("default locale is ko", () => {
		// When no locale is passed, should default to Korean
		const t = useTranslations("strategies");
		expect(t("pageTitle")).toBe("전략");
	});
});

describe("strategies i18n namespace — trading terms invariant", () => {
	test("LONG/SHORT/PASS terms are preserved as-is in both locales", () => {
		// Trading direction values in the UI are never translated
		// They appear as enum values in the data, not as translation keys
		// Verify the modes namespace does NOT override domain terms
		const tEn = useTranslations("strategies", "en");
		const tKo = useTranslations("strategies", "ko");

		// Direction field labels are translated, but the values (LONG/SHORT) are not
		expect(tEn("fields.direction")).toBe("Direction");
		expect(tKo("fields.direction")).toBe("방향");

		// The domain enum values themselves are never in the translation file
		// (confirmed by checking that the keys 'LONG', 'SHORT', 'PASS' don't exist)
		// biome-ignore lint/suspicious/noExplicitAny: intentional missing-key test
		expect(tEn("LONG" as any)).toBe("LONG");
		// biome-ignore lint/suspicious/noExplicitAny: intentional missing-key test
		expect(tKo("LONG" as any)).toBe("LONG");
	});
});
