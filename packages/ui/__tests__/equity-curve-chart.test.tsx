import { describe, expect, test } from "bun:test";
import React from "react";
import { renderToString } from "react-dom/server";
import {
	EquityCurveChart,
	type EquityCurvePoint,
	type EquityCurveChartProps,
} from "../src/views/charts/equity-curve-chart";

describe("EquityCurveChart", () => {
	test("renders container div with data-testid", () => {
		const html = renderToString(<EquityCurveChart data={[]} />);
		expect(html).toContain('data-testid="equity-curve-chart"');
	});

	test("accepts empty data without throwing", () => {
		expect(() => renderToString(<EquityCurveChart data={[]} />)).not.toThrow();
	});

	test("handles single data point without error", () => {
		const data: EquityCurvePoint[] = [
			{ time: 1700000000, equity: 10000, drawdown: 0 },
		];
		expect(() => renderToString(<EquityCurveChart data={data} />)).not.toThrow();
	});

	test("applies custom height and className", () => {
		const html = renderToString(
			<EquityCurveChart data={[]} height={500} className="eq-chart" />,
		);
		expect(html).toContain("eq-chart");
		expect(html).toContain("500px");
	});

	test("exports types correctly", () => {
		const props: EquityCurveChartProps = { data: [] };
		const point: EquityCurvePoint = { time: 0, equity: 10000, drawdown: -0.05 };
		expect(props).toBeDefined();
		expect(point).toBeDefined();
	});
});
