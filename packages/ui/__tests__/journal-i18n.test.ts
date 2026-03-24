import { describe, expect, it } from "bun:test";
import enMessages from "../src/i18n/messages/en.json";
import koMessages from "../src/i18n/messages/ko.json";
import { useTranslations } from "../src/i18n/use-translations";

describe("journal namespace — key consistency", () => {
	it("ko.json has journal namespace", () => {
		expect(koMessages).toHaveProperty("journal");
	});

	it("en.json has journal namespace", () => {
		expect(enMessages).toHaveProperty("journal");
	});

	it("ko and en have the same top-level namespace keys", () => {
		const koKeys = Object.keys(koMessages).sort();
		const enKeys = Object.keys(enMessages).sort();
		expect(koKeys).toEqual(enKeys);
	});

	it("ko and en journal namespace have the same direct keys", () => {
		const koJournalKeys = Object.keys(koMessages.journal).sort();
		const enJournalKeys = Object.keys(enMessages.journal).sort();
		expect(koJournalKeys).toEqual(enJournalKeys);
	});

	it("ko and en journal.entry have the same keys", () => {
		const ko = Object.keys(koMessages.journal.entry).sort();
		const en = Object.keys(enMessages.journal.entry).sort();
		expect(ko).toEqual(en);
	});

	it("ko and en journal.analysis have the same keys", () => {
		const ko = Object.keys(koMessages.journal.analysis).sort();
		const en = Object.keys(enMessages.journal.analysis).sort();
		expect(ko).toEqual(en);
	});

	it("ko and en journal.stats have the same keys", () => {
		const ko = Object.keys(koMessages.journal.stats).sort();
		const en = Object.keys(enMessages.journal.stats).sort();
		expect(ko).toEqual(en);
	});

	it("ko and en journal.comparison have the same keys", () => {
		const ko = Object.keys(koMessages.journal.comparison).sort();
		const en = Object.keys(enMessages.journal.comparison).sort();
		expect(ko).toEqual(en);
	});

	it("ko and en journal.filters have the same keys", () => {
		const ko = Object.keys(koMessages.journal.filters).sort();
		const en = Object.keys(enMessages.journal.filters).sort();
		expect(ko).toEqual(en);
	});

	it("ko and en journal.columns have the same keys", () => {
		const ko = Object.keys(koMessages.journal.columns).sort();
		const en = Object.keys(enMessages.journal.columns).sort();
		expect(ko).toEqual(en);
	});

	it("all journal message values are non-empty strings (ko)", () => {
		const assertNonEmpty = (obj: Record<string, unknown>, path: string) => {
			for (const [key, value] of Object.entries(obj)) {
				const fullPath = `${path}.${key}`;
				if (typeof value === "object" && value !== null) {
					assertNonEmpty(value as Record<string, unknown>, fullPath);
				} else {
					expect(typeof value, `${fullPath} should be string`).toBe("string");
					expect((value as string).length, `${fullPath} should not be empty`).toBeGreaterThan(0);
				}
			}
		};
		assertNonEmpty(koMessages.journal as Record<string, unknown>, "ko.journal");
	});

	it("all journal message values are non-empty strings (en)", () => {
		const assertNonEmpty = (obj: Record<string, unknown>, path: string) => {
			for (const [key, value] of Object.entries(obj)) {
				const fullPath = `${path}.${key}`;
				if (typeof value === "object" && value !== null) {
					assertNonEmpty(value as Record<string, unknown>, fullPath);
				} else {
					expect(typeof value, `${fullPath} should be string`).toBe("string");
					expect((value as string).length, `${fullPath} should not be empty`).toBeGreaterThan(0);
				}
			}
		};
		assertNonEmpty(enMessages.journal as Record<string, unknown>, "en.journal");
	});
});

describe("journal namespace — required keys", () => {
	const requiredEntryKeys = [
		"tradeDate",
		"symbol",
		"side",
		"entryPrice",
		"exitPrice",
		"pnl",
		"duration",
		"entryReason",
		"exitReason",
		"notes",
		"tags",
		"tradeSummary",
	];

	const requiredAnalysisKeys = ["title", "mfe", "mae", "riskReward", "edgeRatio"];

	const requiredStatsKeys = [
		"title",
		"periodPnl",
		"strategyPerformance",
		"totalTrades",
		"winRate",
		"avgPnl",
		"totalPnl",
	];

	const requiredComparisonKeys = [
		"title",
		"backtest",
		"live",
		"backtestVsLive",
		"backtestPnl",
		"livePnl",
		"backtestWinRate",
		"liveWinRate",
	];

	it.each(["ko", "en"] as const)("%s has all required entry keys", (locale) => {
		const messages = locale === "ko" ? koMessages : enMessages;
		for (const key of requiredEntryKeys) {
			expect(messages.journal.entry).toHaveProperty(key);
		}
	});

	it.each(["ko", "en"] as const)("%s has all required analysis keys", (locale) => {
		const messages = locale === "ko" ? koMessages : enMessages;
		for (const key of requiredAnalysisKeys) {
			expect(messages.journal.analysis).toHaveProperty(key);
		}
	});

	it.each(["ko", "en"] as const)("%s has all required stats keys", (locale) => {
		const messages = locale === "ko" ? koMessages : enMessages;
		for (const key of requiredStatsKeys) {
			expect(messages.journal.stats).toHaveProperty(key);
		}
	});

	it.each(["ko", "en"] as const)("%s has all required comparison keys", (locale) => {
		const messages = locale === "ko" ? koMessages : enMessages;
		for (const key of requiredComparisonKeys) {
			expect(messages.journal.comparison).toHaveProperty(key);
		}
	});
});

describe("useTranslations — journal namespace", () => {
	it("resolves pageTitle in ko", () => {
		const t = useTranslations("journal", "ko");
		expect(t("pageTitle")).toBe("트레이드 저널");
	});

	it("resolves pageTitle in en", () => {
		const t = useTranslations("journal", "en");
		expect(t("pageTitle")).toBe("Trade Journal");
	});

	it("resolves nested entry.tradeDate in ko", () => {
		const t = useTranslations("journal", "ko");
		expect(t("entry.tradeDate")).toBe("거래 날짜");
	});

	it("resolves nested entry.tradeDate in en", () => {
		const t = useTranslations("journal", "en");
		expect(t("entry.tradeDate")).toBe("Trade Date");
	});

	it("resolves nested analysis.mfe in ko", () => {
		const t = useTranslations("journal", "ko");
		expect(t("analysis.mfe")).toBe("최대 유리 가격 이동 (MFE)");
	});

	it("resolves nested analysis.mfe in en", () => {
		const t = useTranslations("journal", "en");
		expect(t("analysis.mfe")).toBe("Maximum Favorable Excursion (MFE)");
	});

	it("resolves nested analysis.mae in ko", () => {
		const t = useTranslations("journal", "ko");
		expect(t("analysis.mae")).toBe("최대 불리 가격 이동 (MAE)");
	});

	it("resolves nested comparison.backtestVsLive in ko", () => {
		const t = useTranslations("journal", "ko");
		expect(t("comparison.backtestVsLive")).toBe("백테스트 vs 실거래");
	});

	it("resolves nested comparison.backtestVsLive in en", () => {
		const t = useTranslations("journal", "en");
		expect(t("comparison.backtestVsLive")).toBe("Backtest vs Live");
	});

	it("resolves nested stats.winRate in ko", () => {
		const t = useTranslations("journal", "ko");
		expect(t("stats.winRate")).toBe("승률");
	});

	it("resolves filters.dateRange in ko", () => {
		const t = useTranslations("journal", "ko");
		expect(t("filters.dateRange")).toBe("날짜 범위");
	});

	it("resolves filters.dateRange in en", () => {
		const t = useTranslations("journal", "en");
		expect(t("filters.dateRange")).toBe("Date Range");
	});

	it("resolves columns.pnl in ko", () => {
		const t = useTranslations("journal", "ko");
		expect(t("columns.pnl")).toBe("손익");
	});

	it("resolves columns.pnl in en", () => {
		const t = useTranslations("journal", "en");
		expect(t("columns.pnl")).toBe("PnL");
	});

	it("resolves analysis.riskReward in ko", () => {
		const t = useTranslations("journal", "ko");
		expect(t("analysis.riskReward")).toBe("리스크/리워드 비율");
	});

	it("resolves analysis.edgeRatio in en", () => {
		const t = useTranslations("journal", "en");
		expect(t("analysis.edgeRatio")).toBe("Edge Ratio");
	});
});
