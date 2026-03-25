import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import {
	BacktestComparisonChart,
	type VersionEquitySeries,
} from "../src/views/backtest/backtest-comparison-chart";

const makeSeries = (version: string, equities: number[]): VersionEquitySeries => ({
	version,
	label: `v${version}`,
	data: equities.map((equity, i) => ({
		time: 1700000000 + i * 86400,
		equity,
		drawdown: equity < equities[0] ? (equity - equities[0]) / equities[0] : 0,
	})),
});

describe("BacktestComparisonChart", () => {
	const series: VersionEquitySeries[] = [
		makeSeries("1", [10000, 10200, 10150, 10400]),
		makeSeries("2", [10000, 10100, 10350, 10500]),
	];

	test("renders the chart container", () => {
		const html = renderToString(<BacktestComparisonChart series={series} />);
		expect(html).toContain('data-testid="backtest-comparison-chart"');
	});

	test("renders version labels in legend", () => {
		const html = renderToString(<BacktestComparisonChart series={series} />);
		expect(html).toContain("v1");
		expect(html).toContain("v2");
	});

	test("renders equity panel container", () => {
		const html = renderToString(<BacktestComparisonChart series={series} />);
		expect(html).toContain('data-testid="equity-panel"');
	});

	test("renders drawdown panel container", () => {
		const html = renderToString(<BacktestComparisonChart series={series} />);
		expect(html).toContain('data-testid="drawdown-panel"');
	});

	test("accepts custom height prop", () => {
		const html = renderToString(
			<BacktestComparisonChart series={series} equityHeight={250} drawdownHeight={120} />,
		);
		expect(html).toContain("250px");
		expect(html).toContain("120px");
	});

	test("renders empty state when no series provided", () => {
		const html = renderToString(<BacktestComparisonChart series={[]} />);
		expect(html).toContain('data-testid="comparison-empty"');
	});

	test("renders color swatches in legend", () => {
		const html = renderToString(<BacktestComparisonChart series={series} />);
		// Each legend item should have a color swatch (inline background-color style)
		expect(html).toContain('data-testid="legend-item-v1"');
		expect(html).toContain('data-testid="legend-item-v2"');
	});

	test("accepts className prop", () => {
		const html = renderToString(
			<BacktestComparisonChart series={series} className="custom-class" />,
		);
		expect(html).toContain("custom-class");
	});

	test("assigns distinct colors to each version", () => {
		const threeSeries = [
			makeSeries("1", [10000, 10200]),
			makeSeries("2", [10000, 10100]),
			makeSeries("3", [10000, 10300]),
		];
		const html = renderToString(<BacktestComparisonChart series={threeSeries} />);
		expect(html).toContain("v1");
		expect(html).toContain("v2");
		expect(html).toContain("v3");
	});
});

describe("BacktestComparisonChart i18n", () => {
	const series: VersionEquitySeries[] = [makeSeries("1", [10000, 10200])];

	test("renders Korean section labels by default", () => {
		const html = renderToString(<BacktestComparisonChart series={series} />);
		expect(html).toContain("자산 곡선");
		expect(html).toContain("낙폭");
	});

	test("renders English section labels with en locale", () => {
		const html = renderToString(<BacktestComparisonChart series={series} locale="en" />);
		expect(html).toContain("Equity Curve");
		expect(html).toContain("Drawdown");
	});
});
