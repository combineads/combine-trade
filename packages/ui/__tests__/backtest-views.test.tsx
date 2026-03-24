import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import { BacktestView } from "../src/views/backtest/backtest-view";
import { EquityCurve, type EquityPoint } from "../src/views/backtest/equity-curve";
import { type PnlBucket, PnlDistribution } from "../src/views/backtest/pnl-distribution";
import { TradeStats, type TradeStatsData } from "../src/views/backtest/trade-stats";

describe("TradeStats", () => {
	const stats: TradeStatsData = {
		totalTrades: 250,
		winrate: 0.58,
		expectancy: 0.45,
		profitFactor: 1.82,
		maxDrawdown: 12.5,
		sharpeRatio: 1.35,
		avgHoldBars: 32,
	};

	test("renders trade count", () => {
		const html = renderToString(<TradeStats stats={stats} />);
		expect(html).toContain("250");
	});

	test("renders winrate as percentage (ko locale)", () => {
		const html = renderToString(<TradeStats stats={stats} />);
		// ko locale formats 0.58 as "58%" via Intl
		expect(html).toContain("58%");
	});

	test("renders winrate as percentage (en locale)", () => {
		const html = renderToString(<TradeStats stats={stats} locale="en" />);
		expect(html).toContain("58%");
	});

	test("renders expectancy", () => {
		const html = renderToString(<TradeStats stats={stats} />);
		expect(html).toContain("0.45");
	});

	test("renders max drawdown as percentage (ko locale)", () => {
		const html = renderToString(<TradeStats stats={stats} />);
		// maxDrawdown=12.5 is passed as 12.5/100 = 0.125 to formatPercent → "12.5%"
		expect(html).toContain("12.5%");
	});

	test("renders Korean labels by default", () => {
		const html = renderToString(<TradeStats stats={stats} />);
		expect(html).toContain("거래 횟수");
		expect(html).toContain("승률");
	});

	test("renders English labels with en locale", () => {
		const html = renderToString(<TradeStats stats={stats} locale="en" />);
		expect(html).toContain("Total Trades");
		expect(html).toContain("Win Rate");
	});
});

describe("EquityCurve", () => {
	const points: EquityPoint[] = [
		{ index: 0, equity: 10000 },
		{ index: 1, equity: 10200 },
		{ index: 2, equity: 10150 },
	];

	test("renders equity values", () => {
		const html = renderToString(<EquityCurve points={points} />);
		expect(html).toContain("10,000");
		expect(html).toContain("10,200");
	});

	test("renders Korean empty state", () => {
		const html = renderToString(<EquityCurve points={[]} />);
		expect(html).toContain("데이터 없음");
	});

	test("renders Korean equity curve label", () => {
		const html = renderToString(<EquityCurve points={points} />);
		expect(html).toContain("자산 곡선");
	});
});

describe("PnlDistribution", () => {
	const buckets: PnlBucket[] = [
		{ range: "-3% to -2%", count: 5 },
		{ range: "-1% to 0%", count: 15 },
		{ range: "0% to 1%", count: 25 },
		{ range: "1% to 2%", count: 20 },
	];

	test("renders bucket ranges", () => {
		const html = renderToString(<PnlDistribution buckets={buckets} />);
		expect(html).toContain("-3% to -2%");
		expect(html).toContain("0% to 1%");
	});

	test("renders counts", () => {
		const html = renderToString(<PnlDistribution buckets={buckets} />);
		expect(html).toContain("25");
	});

	test("renders Korean PnL distribution label", () => {
		const html = renderToString(<PnlDistribution buckets={buckets} />);
		expect(html).toContain("손익 분포");
	});

	test("renders Korean empty state", () => {
		const html = renderToString(<PnlDistribution buckets={[]} />);
		expect(html).toContain("데이터 없음");
	});
});

describe("BacktestView", () => {
	test("renders Korean heading", () => {
		const html = renderToString(<BacktestView strategies={[]} />);
		expect(html).toContain("백테스트");
	});

	test("renders strategy selector", () => {
		const html = renderToString(<BacktestView strategies={[{ id: "s1", name: "Momentum v3" }]} />);
		expect(html).toContain("Momentum v3");
	});

	test("renders Korean run button", () => {
		const html = renderToString(<BacktestView strategies={[]} />);
		expect(html).toContain("백테스트 실행");
	});
});
