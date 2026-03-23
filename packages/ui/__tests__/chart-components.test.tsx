import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import { ChartContainer } from "../src/components/chart-container";
import { ClientOnly } from "../src/components/client-only";
import { CandlestickChartView } from "../src/views/charts/candlestick-chart-view";
import { EventMarker, type MarkerType, TpSlOverlay } from "../src/views/charts/event-markers";
import { TimeframeSelector } from "../src/views/charts/timeframe-selector";

describe("ClientOnly", () => {
	test("renders fallback on server", () => {
		const html = renderToString(
			<ClientOnly fallback={<div>Loading...</div>}>
				<div>Client content</div>
			</ClientOnly>,
		);
		expect(html).toContain("Loading...");
	});
});

describe("ChartContainer", () => {
	test("renders skeleton fallback in SSR", () => {
		const html = renderToString(<ChartContainer width="100%" height={400} />);
		// Should render a placeholder div with the specified height
		expect(html).toContain("400px");
	});
});

describe("TimeframeSelector", () => {
	test("renders all timeframes", () => {
		const html = renderToString(<TimeframeSelector current="1m" onSelect={() => {}} />);
		expect(html).toContain("1m");
		expect(html).toContain("5m");
		expect(html).toContain("15m");
		expect(html).toContain("1h");
	});

	test("highlights current timeframe", () => {
		const html = renderToString(<TimeframeSelector current="5m" onSelect={() => {}} />);
		// Active button should have primary color
		expect(html).toContain("#22C55E");
	});
});

describe("CandlestickChartView", () => {
	test("renders symbol", () => {
		const html = renderToString(<CandlestickChartView symbol="BTCUSDT" timeframe="1m" />);
		expect(html).toContain("BTCUSDT");
	});

	test("renders timeframe selector", () => {
		const html = renderToString(<CandlestickChartView symbol="BTCUSDT" timeframe="5m" />);
		expect(html).toContain("1m");
		expect(html).toContain("5m");
	});

	test("renders chart area", () => {
		const html = renderToString(<CandlestickChartView symbol="BTCUSDT" timeframe="1m" />);
		// Should have a chart container placeholder
		expect(html).toContain("400px");
	});
});

describe("EventMarker", () => {
	const types: MarkerType[] = ["LONG", "SHORT", "WIN", "LOSS", "TIME_EXIT"];

	test("renders all marker types", () => {
		for (const type of types) {
			const html = renderToString(<EventMarker type={type} />);
			expect(html.length).toBeGreaterThan(0);
		}
	});

	test("LONG marker is green", () => {
		const html = renderToString(<EventMarker type="LONG" />);
		expect(html).toContain("#22C55E");
	});

	test("SHORT marker is red", () => {
		const html = renderToString(<EventMarker type="SHORT" />);
		expect(html).toContain("#EF4444");
	});

	test("WIN marker is green", () => {
		const html = renderToString(<EventMarker type="WIN" />);
		expect(html).toContain("#22C55E");
	});

	test("LOSS marker is red", () => {
		const html = renderToString(<EventMarker type="LOSS" />);
		expect(html).toContain("#EF4444");
	});

	test("TIME_EXIT marker is gray", () => {
		const html = renderToString(<EventMarker type="TIME_EXIT" />);
		expect(html).toContain("#64748B");
	});
});

describe("TpSlOverlay", () => {
	test("renders TP and SL values", () => {
		const html = renderToString(
			<TpSlOverlay entryPrice={50000} takeProfit={51000} stopLoss={49500} />,
		);
		expect(html).toContain("51,000");
		expect(html).toContain("49,500");
	});

	test("renders entry price", () => {
		const html = renderToString(
			<TpSlOverlay entryPrice={50000} takeProfit={51000} stopLoss={49500} />,
		);
		expect(html).toContain("50,000");
	});
});
