import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import {
	RadarChart,
	type RadarChartProps,
	type RadarMetric,
	type RadarSeries,
	computePolygonPoints,
	normalizeValue,
} from "../src/views/charts/radar-chart";

const defaultMetrics: RadarMetric[] = [
	{ key: "winrate", label: "Win Rate", min: 0, max: 1, higherIsBetter: true },
	{ key: "sharpe", label: "Sharpe", min: 0, max: 3, higherIsBetter: true },
	{ key: "drawdown", label: "Drawdown", min: 0, max: 0.5, higherIsBetter: false },
	{ key: "expectancy", label: "Expectancy", min: -1, max: 3, higherIsBetter: true },
	{ key: "tradeCount", label: "Trades", min: 0, max: 500, higherIsBetter: true },
];

const singleSeries: RadarSeries[] = [
	{
		id: "strategy-a",
		label: "Strategy A",
		values: { winrate: 0.6, sharpe: 1.5, drawdown: 0.1, expectancy: 0.8, tradeCount: 200 },
		color: "#22c55e",
	},
];

const twoSeries: RadarSeries[] = [
	{
		id: "strategy-a",
		label: "Strategy A",
		values: { winrate: 0.6, sharpe: 1.5, drawdown: 0.1, expectancy: 0.8, tradeCount: 200 },
		color: "#22c55e",
	},
	{
		id: "strategy-b",
		label: "Strategy B",
		values: { winrate: 0.45, sharpe: 0.9, drawdown: 0.25, expectancy: 0.3, tradeCount: 120 },
		color: "#3b82f6",
	},
];

describe("RadarChart", () => {
	test("renders SVG element", () => {
		const html = renderToString(<RadarChart metrics={defaultMetrics} series={singleSeries} />);
		expect(html).toContain("<svg");
	});

	test("renders data-testid attribute", () => {
		const html = renderToString(<RadarChart metrics={defaultMetrics} series={singleSeries} />);
		expect(html).toContain('data-testid="radar-chart"');
	});

	test("renders axis labels for all metrics", () => {
		const html = renderToString(<RadarChart metrics={defaultMetrics} series={singleSeries} />);
		expect(html).toContain("Win Rate");
		expect(html).toContain("Sharpe");
		expect(html).toContain("Drawdown");
		expect(html).toContain("Expectancy");
		expect(html).toContain("Trades");
	});

	test("renders polygon for single series", () => {
		const html = renderToString(<RadarChart metrics={defaultMetrics} series={singleSeries} />);
		expect(html).toContain("<polygon");
	});

	test("renders legend label for single series", () => {
		const html = renderToString(<RadarChart metrics={defaultMetrics} series={singleSeries} />);
		expect(html).toContain("Strategy A");
	});

	test("renders two polygons in comparison mode", () => {
		const html = renderToString(<RadarChart metrics={defaultMetrics} series={twoSeries} />);
		const polygonCount = (html.match(/<polygon/g) ?? []).length;
		expect(polygonCount).toBeGreaterThanOrEqual(2);
	});

	test("renders legend labels for both series in comparison mode", () => {
		const html = renderToString(<RadarChart metrics={defaultMetrics} series={twoSeries} />);
		expect(html).toContain("Strategy A");
		expect(html).toContain("Strategy B");
	});

	test("renders grid circles or lines for radar background", () => {
		const html = renderToString(<RadarChart metrics={defaultMetrics} series={singleSeries} />);
		// should render concentric circles or polygons for the grid
		const hasCircle = html.includes("<circle") || html.includes("<polygon");
		expect(hasCircle).toBe(true);
	});

	test("accepts custom size prop", () => {
		const html = renderToString(
			<RadarChart metrics={defaultMetrics} series={singleSeries} size={500} />,
		);
		expect(html).toContain("500");
	});

	test("accepts custom className prop", () => {
		const html = renderToString(
			<RadarChart metrics={defaultMetrics} series={singleSeries} className="my-radar" />,
		);
		expect(html).toContain("my-radar");
	});

	test("renders empty state when no series provided", () => {
		const html = renderToString(<RadarChart metrics={defaultMetrics} series={[]} />);
		expect(html).toContain('data-testid="radar-chart"');
	});

	test("renders empty state when no metrics provided", () => {
		const html = renderToString(<RadarChart metrics={[]} series={singleSeries} />);
		expect(html).toContain('data-testid="radar-chart"');
	});

	test("dark theme renders without error", () => {
		expect(() =>
			renderToString(<RadarChart metrics={defaultMetrics} series={singleSeries} theme="dark" />),
		).not.toThrow();
	});

	test("light theme renders without error", () => {
		expect(() =>
			renderToString(<RadarChart metrics={defaultMetrics} series={singleSeries} theme="light" />),
		).not.toThrow();
	});

	test("series colors appear in output", () => {
		const html = renderToString(<RadarChart metrics={defaultMetrics} series={singleSeries} />);
		expect(html).toContain("#22c55e");
	});

	test("comparison mode renders both series colors", () => {
		const html = renderToString(<RadarChart metrics={defaultMetrics} series={twoSeries} />);
		expect(html).toContain("#22c55e");
		expect(html).toContain("#3b82f6");
	});
});

describe("normalizeValue", () => {
	test("normalizes mid-range value to 0.5", () => {
		const result = normalizeValue(0.5, 0, 1, true);
		expect(result).toBeCloseTo(0.5);
	});

	test("normalizes max value to 1.0 for higherIsBetter", () => {
		const result = normalizeValue(1, 0, 1, true);
		expect(result).toBeCloseTo(1.0);
	});

	test("normalizes min value to 0.0 for higherIsBetter", () => {
		const result = normalizeValue(0, 0, 1, true);
		expect(result).toBeCloseTo(0.0);
	});

	test("inverts for higherIsBetter=false (drawdown)", () => {
		// low drawdown (0.1) should normalize high (good)
		const lowDD = normalizeValue(0.1, 0, 0.5, false);
		const highDD = normalizeValue(0.4, 0, 0.5, false);
		expect(lowDD).toBeGreaterThan(highDD);
	});

	test("clamps to [0, 1] range when value exceeds max", () => {
		const result = normalizeValue(2, 0, 1, true);
		expect(result).toBeLessThanOrEqual(1);
	});

	test("clamps to [0, 1] range when value is below min", () => {
		const result = normalizeValue(-1, 0, 1, true);
		expect(result).toBeGreaterThanOrEqual(0);
	});

	test("handles zero range (min === max) without division by zero", () => {
		const result = normalizeValue(5, 5, 5, true);
		expect(Number.isFinite(result)).toBe(true);
	});
});

describe("computePolygonPoints", () => {
	test("returns correct number of points for 5 axes", () => {
		const values = [0.5, 0.8, 0.3, 0.7, 0.6];
		const points = computePolygonPoints(values, 100, 200, 200);
		// "x1,y1 x2,y2 ..." split by space gives N segments
		const pointPairs = points.trim().split(/\s+/);
		expect(pointPairs).toHaveLength(5);
	});

	test("returns correct number of points for 3 axes", () => {
		const values = [1.0, 0.5, 0.0];
		const points = computePolygonPoints(values, 100, 200, 200);
		const pointPairs = points.trim().split(/\s+/);
		expect(pointPairs).toHaveLength(3);
	});

	test("full radius value (1.0) produces point at max radius", () => {
		const radius = 100;
		const cx = 200;
		const cy = 200;
		// First axis is at top (angle = -PI/2), value = 1.0
		const values = [1.0];
		const points = computePolygonPoints(values, radius, cx, cy);
		const [xStr, yStr] = points.trim().split(",");
		const x = Number.parseFloat(xStr);
		const y = Number.parseFloat(yStr);
		// Distance from center should be ~radius
		const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
		expect(dist).toBeCloseTo(radius, 1);
	});

	test("zero value produces point at center", () => {
		const radius = 100;
		const cx = 200;
		const cy = 200;
		const values = [0.0];
		const points = computePolygonPoints(values, radius, cx, cy);
		const [xStr, yStr] = points.trim().split(",");
		const x = Number.parseFloat(xStr);
		const y = Number.parseFloat(yStr);
		const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
		expect(dist).toBeCloseTo(0, 1);
	});

	test("produces valid numeric coordinates", () => {
		const values = [0.5, 0.8, 0.3, 0.7, 0.6];
		const points = computePolygonPoints(values, 100, 200, 200);
		for (const pair of points.trim().split(/\s+/)) {
			const [x, y] = pair.split(",").map(Number);
			expect(Number.isFinite(x)).toBe(true);
			expect(Number.isFinite(y)).toBe(true);
		}
	});
});

describe("RadarChart types", () => {
	test("RadarMetric type is usable", () => {
		const metric: RadarMetric = {
			key: "winrate",
			label: "Win Rate",
			min: 0,
			max: 1,
			higherIsBetter: true,
		};
		expect(metric.key).toBe("winrate");
	});

	test("RadarSeries type is usable", () => {
		const series: RadarSeries = {
			id: "s1",
			label: "Test",
			values: { winrate: 0.5 },
			color: "#ff0000",
		};
		expect(series.id).toBe("s1");
	});

	test("RadarChartProps type accepts all optional props", () => {
		const props: RadarChartProps = {
			metrics: defaultMetrics,
			series: singleSeries,
			size: 400,
			className: "test",
			theme: "dark",
		};
		expect(props.size).toBe(400);
	});
});
