import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import {
	LightweightChart,
	type LightweightChartProps,
	type OHLCVBar,
} from "../src/views/charts/lightweight-chart";

describe("LightweightChart", () => {
	test("renders container div with data-testid", () => {
		const html = renderToString(<LightweightChart data={[]} />);
		expect(html).toContain('data-testid="lightweight-chart"');
	});

	test("accepts empty data array without throwing", () => {
		expect(() => renderToString(<LightweightChart data={[]} />)).not.toThrow();
	});

	test("accepts OHLCVBar data without error", () => {
		const data: OHLCVBar[] = [
			{ time: 1700000000, open: 100, high: 110, low: 90, close: 105 },
			{ time: 1700003600, open: 105, high: 115, low: 95, close: 110, volume: 1000 },
		];
		expect(() => renderToString(<LightweightChart data={data} />)).not.toThrow();
	});

	test("applies custom height and className", () => {
		const html = renderToString(<LightweightChart data={[]} height={600} className="my-chart" />);
		expect(html).toContain("my-chart");
		expect(html).toContain("600px");
	});

	test("exports types correctly", () => {
		// Type-level test: verify exports are usable
		const props: LightweightChartProps = { data: [] };
		const bar: OHLCVBar = { time: 0, open: 1, high: 2, low: 0, close: 1 };
		expect(props).toBeDefined();
		expect(bar).toBeDefined();
	});
});
