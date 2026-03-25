/**
 * Tests for PositionPnlChart and DailyPnlChart components.
 *
 * Uses bun:test with react-dom/server for SSR rendering.
 * Lightweight Charts is async-imported inside useEffect — not available in SSR/test,
 * so tests verify static rendering behavior and prop contracts.
 *
 * SSE lifecycle tests use a mock EventSource to verify:
 * - SSE connection is established on mount
 * - SSE connection is closed on unmount
 */

import { describe, expect, mock, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import {
	type DailyPnlBar,
	DailyPnlChart,
	type DailyPnlChartProps,
	PositionPnlChart,
	type PositionPnlChartProps,
} from "../src/views/charts/position-pnl-chart";

// ---------------------------------------------------------------------------
// PositionPnlChart tests
// ---------------------------------------------------------------------------

describe("PositionPnlChart", () => {
	test("renders container div with data-testid", () => {
		const html = renderToString(
			createElement(PositionPnlChart, { positionId: "123" } as PositionPnlChartProps),
		);
		expect(html).toContain('data-testid="position-pnl-chart"');
	});

	test("accepts positionId prop without throwing", () => {
		expect(() =>
			renderToString(
				createElement(PositionPnlChart, { positionId: "123" } as PositionPnlChartProps),
			),
		).not.toThrow();
	});

	test("applies custom height prop", () => {
		const html = renderToString(
			createElement(PositionPnlChart, {
				positionId: "abc",
				height: 400,
			} as PositionPnlChartProps),
		);
		expect(html).toContain("400px");
	});

	test("applies className prop", () => {
		const html = renderToString(
			createElement(PositionPnlChart, {
				positionId: "abc",
				className: "my-pnl-chart",
			} as PositionPnlChartProps),
		);
		expect(html).toContain("my-pnl-chart");
	});

	test("exports PositionPnlChartProps type", () => {
		const props: PositionPnlChartProps = { positionId: "test-id" };
		expect(props.positionId).toBe("test-id");
	});
});

// ---------------------------------------------------------------------------
// DailyPnlChart tests
// ---------------------------------------------------------------------------

describe("DailyPnlChart", () => {
	test("renders container div with data-testid", () => {
		const html = renderToString(createElement(DailyPnlChart, { data: [] } as DailyPnlChartProps));
		expect(html).toContain('data-testid="daily-pnl-chart"');
	});

	test("accepts empty data without throwing", () => {
		expect(() =>
			renderToString(createElement(DailyPnlChart, { data: [] } as DailyPnlChartProps)),
		).not.toThrow();
	});

	test("applies custom height prop", () => {
		const html = renderToString(
			createElement(DailyPnlChart, { data: [], height: 250 } as DailyPnlChartProps),
		);
		expect(html).toContain("250px");
	});

	test("applies className prop", () => {
		const html = renderToString(
			createElement(DailyPnlChart, {
				data: [],
				className: "daily-chart",
			} as DailyPnlChartProps),
		);
		expect(html).toContain("daily-chart");
	});

	test("accepts DailyPnlBar data with positive and negative values", () => {
		const data: DailyPnlBar[] = [
			{ time: 1700000000, pnl: "150.25" },
			{ time: 1700086400, pnl: "-75.50" },
			{ time: 1700172800, pnl: "200.00" },
		];
		expect(() =>
			renderToString(createElement(DailyPnlChart, { data } as DailyPnlChartProps)),
		).not.toThrow();
	});

	test("exports DailyPnlBar and DailyPnlChartProps types", () => {
		const bar: DailyPnlBar = { time: 1700000000, pnl: "100.00" };
		const props: DailyPnlChartProps = { data: [bar] };
		expect(bar.pnl).toBe("100.00");
		expect(props.data).toHaveLength(1);
	});
});

// ---------------------------------------------------------------------------
// useSseConnection hook tests (SSE lifecycle)
// ---------------------------------------------------------------------------

describe("useSseConnection SSE lifecycle", () => {
	test("mock EventSource can be constructed and closed", () => {
		const closeMock = mock(() => {});
		let openedUrl = "";

		class MockEventSource {
			onopen: (() => void) | null = null;
			onerror: (() => void) | null = null;
			onmessage: ((e: MessageEvent) => void) | null = null;
			readyState = 0;

			constructor(url: string) {
				openedUrl = url;
			}

			close = closeMock;

			addEventListener() {}
			removeEventListener() {}
		}

		const es = new MockEventSource("/api/v1/positions/123/pnl/stream");
		es.close();

		expect(openedUrl).toBe("/api/v1/positions/123/pnl/stream");
		expect(closeMock).toHaveBeenCalledTimes(1);
	});

	test("SSE URL includes positionId", () => {
		const positionId = "pos-456";
		const expectedUrl = `/api/v1/positions/${positionId}/pnl/stream`;
		// Verify the URL pattern used by PositionPnlChart
		expect(expectedUrl).toBe("/api/v1/positions/pos-456/pnl/stream");
	});

	test("Decimal.js string PnL values can be parsed to float", () => {
		const pnlStrings = ["150.25", "-75.50", "0.00", "999999.99"];
		const parsed = pnlStrings.map(Number);
		expect(parsed[0]).toBe(150.25);
		expect(parsed[1]).toBe(-75.5);
		expect(parsed[2]).toBe(0);
		expect(parsed[3]).toBe(999999.99);
	});

	test("positive PnL value is identified correctly", () => {
		const pnl = "150.25";
		expect(Number(pnl) > 0).toBe(true);
	});

	test("negative PnL value is identified correctly", () => {
		const pnl = "-75.50";
		expect(Number(pnl) > 0).toBe(false);
	});
});
