import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import { enMessages, getTranslations, koMessages } from "../src/i18n";
import { DashboardView } from "../src/views/dashboard/dashboard-view";
import { KillSwitchCard } from "../src/views/dashboard/kill-switch-card";
import { RecentEvents } from "../src/views/dashboard/recent-events";
import { StrategySummary } from "../src/views/dashboard/strategy-summary";
import { WorkerStatus } from "../src/views/dashboard/worker-status";

// ── Namespace structure ────────────────────────────────────────────────────

describe("dashboard namespace — message files", () => {
	test("ko.json has dashboard namespace", () => {
		expect(koMessages).toHaveProperty("dashboard");
	});

	test("en.json has dashboard namespace", () => {
		expect(enMessages).toHaveProperty("dashboard");
	});

	test("ko and en have identical top-level keys in dashboard namespace", () => {
		const koKeys = Object.keys(koMessages.dashboard).sort();
		const enKeys = Object.keys(enMessages.dashboard).sort();
		expect(koKeys).toEqual(enKeys);
	});

	test("dashboard.sections keys match in ko and en", () => {
		const koKeys = Object.keys(koMessages.dashboard.sections).sort();
		const enKeys = Object.keys(enMessages.dashboard.sections).sort();
		expect(koKeys).toEqual(enKeys);
	});

	test("dashboard.killSwitch keys match in ko and en", () => {
		const koKeys = Object.keys(koMessages.dashboard.killSwitch).sort();
		const enKeys = Object.keys(enMessages.dashboard.killSwitch).sort();
		expect(koKeys).toEqual(enKeys);
	});

	test("dashboard.workerStatus keys match in ko and en", () => {
		const koKeys = Object.keys(koMessages.dashboard.workerStatus).sort();
		const enKeys = Object.keys(enMessages.dashboard.workerStatus).sort();
		expect(koKeys).toEqual(enKeys);
	});

	test("dashboard.strategies keys match in ko and en", () => {
		const koKeys = Object.keys(koMessages.dashboard.strategies).sort();
		const enKeys = Object.keys(enMessages.dashboard.strategies).sort();
		expect(koKeys).toEqual(enKeys);
	});

	test("dashboard.recentEvents keys match in ko and en", () => {
		const koKeys = Object.keys(koMessages.dashboard.recentEvents).sort();
		const enKeys = Object.keys(enMessages.dashboard.recentEvents).sort();
		expect(koKeys).toEqual(enKeys);
	});
});

// ── getTranslations helper ─────────────────────────────────────────────────

describe("getTranslations — dashboard namespace", () => {
	test("returns ko translation for title", () => {
		const t = getTranslations("dashboard", "ko");
		expect(t("title")).toBe("대시보드");
	});

	test("returns en translation for title", () => {
		const t = getTranslations("dashboard", "en");
		expect(t("title")).toBe("Dashboard");
	});

	test("returns nested key via dot notation", () => {
		const t = getTranslations("dashboard", "en");
		expect(t("sections.workers")).toBe("Workers");
	});

	test("returns ko nested key via dot notation", () => {
		const t = getTranslations("dashboard", "ko");
		expect(t("sections.workers")).toBe("워커");
	});

	test("returns key path as fallback for missing key", () => {
		const t = getTranslations("dashboard", "en");
		expect(t("nonexistent.key")).toBe("nonexistent.key");
	});

	test("defaults to ko locale when locale is omitted", () => {
		const t = getTranslations("dashboard");
		expect(t("title")).toBe("대시보드");
	});

	test("killSwitch translations present in ko", () => {
		const t = getTranslations("dashboard", "ko");
		expect(t("killSwitch.tradingActive")).toBe("트레이딩 활성");
		expect(t("killSwitch.allTradingHalted")).toBe("전체 트레이딩 중단");
		expect(t("killSwitch.activateButton")).toBe("킬 스위치 활성화");
		expect(t("killSwitch.releaseButton")).toBe("킬 스위치 해제");
	});

	test("killSwitch translations present in en", () => {
		const t = getTranslations("dashboard", "en");
		expect(t("killSwitch.tradingActive")).toBe("Trading Active");
		expect(t("killSwitch.allTradingHalted")).toBe("ALL TRADING HALTED");
		expect(t("killSwitch.activateButton")).toBe("Activate Kill Switch");
		expect(t("killSwitch.releaseButton")).toBe("Release Kill Switch");
	});

	test("workerStatus translations present in ko", () => {
		const t = getTranslations("dashboard", "ko");
		expect(t("workerStatus.running")).toBe("실행 중");
		expect(t("workerStatus.down")).toBe("다운");
		expect(t("workerStatus.inactive")).toBe("비활성");
	});
});

// ── Component rendering with translations ─────────────────────────────────

describe("DashboardView with en translations", () => {
	test("renders page title from translations", () => {
		const html = renderToString(
			<DashboardView
				locale="en"
				killSwitchActive={false}
				strategies={[]}
				recentEvents={[]}
				workers={[]}
			/>,
		);
		expect(html).toContain("Dashboard");
	});

	test("renders section headers from translations", () => {
		const html = renderToString(
			<DashboardView
				locale="en"
				killSwitchActive={false}
				strategies={[]}
				recentEvents={[]}
				workers={[]}
			/>,
		);
		expect(html).toContain("Workers");
		expect(html).toContain("Strategies");
		expect(html).toContain("Recent Events");
	});
});

describe("DashboardView with ko translations", () => {
	test("renders Korean page title", () => {
		const html = renderToString(
			<DashboardView
				locale="ko"
				killSwitchActive={false}
				strategies={[]}
				recentEvents={[]}
				workers={[]}
			/>,
		);
		expect(html).toContain("대시보드");
	});

	test("renders Korean section headers", () => {
		const html = renderToString(
			<DashboardView
				locale="ko"
				killSwitchActive={false}
				strategies={[]}
				recentEvents={[]}
				workers={[]}
			/>,
		);
		expect(html).toContain("워커");
		expect(html).toContain("전략");
		expect(html).toContain("최근 이벤트");
	});
});

describe("KillSwitchCard with translations", () => {
	test("renders trading active text in en", () => {
		const t = getTranslations("dashboard", "en");
		const html = renderToString(<KillSwitchCard active={false} t={t} />);
		expect(html).toContain("Trading Active");
		expect(html).toContain("Activate Kill Switch");
	});

	test("renders halted text in en", () => {
		const t = getTranslations("dashboard", "en");
		const html = renderToString(<KillSwitchCard active={true} t={t} />);
		expect(html).toContain("ALL TRADING HALTED");
		expect(html).toContain("Release Kill Switch");
	});

	test("renders Korean text when ko locale", () => {
		const t = getTranslations("dashboard", "ko");
		const html = renderToString(<KillSwitchCard active={false} t={t} />);
		expect(html).toContain("트레이딩 활성");
		expect(html).toContain("킬 스위치 활성화");
	});

	test("renders Korean halted text", () => {
		const t = getTranslations("dashboard", "ko");
		const html = renderToString(<KillSwitchCard active={true} t={t} />);
		expect(html).toContain("전체 트레이딩 중단");
		expect(html).toContain("킬 스위치 해제");
	});
});

describe("StrategySummary with translations", () => {
	test("renders Korean empty state", () => {
		const t = getTranslations("dashboard", "ko");
		const html = renderToString(<StrategySummary strategies={[]} t={t} />);
		expect(html).toContain("전략 없음");
	});

	test("renders English empty state", () => {
		const t = getTranslations("dashboard", "en");
		const html = renderToString(<StrategySummary strategies={[]} t={t} />);
		expect(html).toContain("No strategies yet");
	});
});

describe("RecentEvents with translations", () => {
	test("renders Korean empty state", () => {
		const t = getTranslations("dashboard", "ko");
		const html = renderToString(<RecentEvents events={[]} t={t} />);
		expect(html).toContain("감지된 이벤트 없음");
	});

	test("renders English empty state", () => {
		const t = getTranslations("dashboard", "en");
		const html = renderToString(<RecentEvents events={[]} t={t} />);
		expect(html).toContain("No events detected");
	});
});

describe("WorkerStatus with translations", () => {
	test("renders worker status labels in ko", () => {
		const t = getTranslations("dashboard", "ko");
		const workers = [
			{ name: "candle-collector", status: "running" as const },
			{ name: "execution-worker", status: "inactive" as const },
		];
		const html = renderToString(<WorkerStatus workers={workers} t={t} />);
		expect(html).toContain("candle-collector");
		expect(html).toContain("실행 중");
		expect(html).toContain("비활성");
	});

	test("renders worker status labels in en", () => {
		const t = getTranslations("dashboard", "en");
		const workers = [{ name: "strategy-worker", status: "down" as const }];
		const html = renderToString(<WorkerStatus workers={workers} t={t} />);
		expect(html).toContain("strategy-worker");
		expect(html).toContain("down");
	});
});
