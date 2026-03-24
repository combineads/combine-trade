import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import { ConfigPanels, type StrategyConfig } from "../src/views/strategies/config-panels";
import {
	type StrategyDetail,
	StrategyEditorView,
} from "../src/views/strategies/strategy-editor-view";
import { StrategyStats, type StrategyStatsData } from "../src/views/strategies/strategy-stats";

const sampleStrategy: StrategyDetail = {
	id: "s1",
	name: "Momentum v3",
	code: 'export default function evaluate(candle) {\n  return { direction: "LONG" };\n}',
	version: 3,
	direction: "long",
	status: "active",
	symbols: ["BTCUSDT", "ETHUSDT"],
	timeframes: ["1m", "5m"],
	config: {
		features: [
			{ name: "bb_position", normalization: "minmax" },
			{ name: "rsi_14", normalization: "minmax" },
		],
		search: { topK: 50, similarityThreshold: 0.85, minSamples: 30 },
		result: { takeProfitPct: 1.5, stopLossPct: 1.0, maxHoldBars: 60 },
		decision: { minWinrate: 0.55, minExpectancy: 0.3 },
	},
	mode: "alert",
};

const sampleStats: StrategyStatsData = {
	winrate: 0.652,
	expectancy: 0.43,
	sampleCount: 1420,
	totalEvents: 3500,
	avgHoldBars: 28,
};

describe("ConfigPanels", () => {
	const config: StrategyConfig = sampleStrategy.config;

	test("renders basic info section", () => {
		const html = renderToString(
			<ConfigPanels
				name="Momentum v3"
				direction="long"
				symbols={["BTCUSDT", "ETHUSDT"]}
				timeframes={["1m", "5m"]}
				config={config}
				mode="alert"
			/>,
		);
		expect(html).toContain("Momentum v3");
		expect(html).toContain("long");
		expect(html).toContain("BTCUSDT");
	});

	test("renders features section", () => {
		const html = renderToString(
			<ConfigPanels
				name="Momentum v3"
				direction="long"
				symbols={["BTCUSDT"]}
				timeframes={["1m"]}
				config={config}
				mode="alert"
			/>,
		);
		expect(html).toContain("bb_position");
		expect(html).toContain("rsi_14");
		expect(html).toContain("minmax");
	});

	test("renders search config", () => {
		const html = renderToString(
			<ConfigPanels
				name="Test"
				direction="long"
				symbols={[]}
				timeframes={[]}
				config={config}
				mode="alert"
			/>,
		);
		expect(html).toContain("50");
		expect(html).toContain("0.85");
		expect(html).toContain("30");
	});

	test("renders result config", () => {
		const html = renderToString(
			<ConfigPanels
				name="Test"
				direction="long"
				symbols={[]}
				timeframes={[]}
				config={config}
				mode="alert"
			/>,
		);
		expect(html).toContain("1.5");
		expect(html).toContain("1");
		expect(html).toContain("60");
	});

	test("renders decision config", () => {
		const html = renderToString(
			<ConfigPanels
				name="Test"
				direction="long"
				symbols={[]}
				timeframes={[]}
				config={config}
				mode="alert"
			/>,
		);
		expect(html).toContain("0.55");
		expect(html).toContain("0.3");
	});

	test("renders execution mode", () => {
		const html = renderToString(
			<ConfigPanels
				name="Test"
				direction="long"
				symbols={[]}
				timeframes={[]}
				config={config}
				mode="paper-trade"
			/>,
		);
		expect(html).toContain("paper-trade");
	});
});

describe("StrategyStats", () => {
	test("renders winrate percentage", () => {
		const html = renderToString(<StrategyStats stats={sampleStats} />);
		expect(html).toContain("65.2");
	});

	test("renders expectancy", () => {
		const html = renderToString(<StrategyStats stats={sampleStats} />);
		expect(html).toContain("0.43");
	});

	test("renders sample count", () => {
		const html = renderToString(<StrategyStats stats={sampleStats} />);
		expect(html).toContain("1,420");
	});

	test("renders total events", () => {
		const html = renderToString(<StrategyStats stats={sampleStats} />);
		expect(html).toContain("3,500");
	});
});

describe("StrategyEditorView", () => {
	test("renders strategy name in header", () => {
		const html = renderToString(
			<StrategyEditorView strategy={sampleStrategy} stats={sampleStats} />,
		);
		expect(html).toContain("Momentum v3");
	});

	test("renders code placeholder when Monaco unavailable (SSR)", () => {
		const html = renderToString(
			<StrategyEditorView strategy={sampleStrategy} stats={sampleStats} />,
		);
		// In SSR, Monaco can't render — should show a code block fallback
		expect(html).toContain("evaluate");
	});

	test("renders config panels", () => {
		const html = renderToString(
			<StrategyEditorView strategy={sampleStrategy} stats={sampleStats} />,
		);
		expect(html).toContain("bb_position");
	});

	test("renders stats section", () => {
		const html = renderToString(
			<StrategyEditorView strategy={sampleStrategy} stats={sampleStats} />,
		);
		expect(html).toContain("65.2");
	});

	test("renders save button", () => {
		const html = renderToString(
			<StrategyEditorView strategy={sampleStrategy} stats={sampleStats} locale="en" />,
		);
		expect(html).toContain("Save");
	});

	test("renders status bar", () => {
		const html = renderToString(
			<StrategyEditorView strategy={sampleStrategy} stats={sampleStats} />,
		);
		expect(html).toContain("TypeScript");
	});
});
