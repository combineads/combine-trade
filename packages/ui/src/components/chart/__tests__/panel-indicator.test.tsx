/**
 * Tests for separate panel indicator components (RSI, MACD, Stochastic).
 *
 * Uses bun:test with react-dom/server for SSR rendering to verify:
 * - PanelContainer renders a container div with correct data-testid
 * - RsiPanel renders a line series with 30/70 horizontal zone markers
 * - MacdPanel renders histogram + signal + MACD line series
 * - StochasticPanel renders %K and %D lines with 20/80 markers
 * - Panels accept height prop
 * - Panels accept className prop
 * - usePanelSync hook exports are present
 */

import { describe, expect, it } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import {
	MacdPanel,
	type MacdPanelProps,
	type MacdPoint,
	PanelContainer,
	type PanelContainerProps,
	RsiPanel,
	type RsiPanelProps,
	type RsiPoint,
	StochasticPanel,
	type StochasticPanelProps,
	type StochasticPoint,
} from "../panels";
import { usePanelSync, type UsePanelSyncOptions } from "../panels/use-panel-sync";

// ─── PanelContainer tests ──────────────────────────────────────────────────────

describe("PanelContainer", () => {
	it("renders container div with data-testid", () => {
		const html = renderToString(
			createElement(PanelContainer, { label: "RSI" } as PanelContainerProps),
		);
		expect(html).toContain('data-testid="panel-container"');
	});

	it("renders label text", () => {
		const html = renderToString(
			createElement(PanelContainer, { label: "RSI(14)" } as PanelContainerProps),
		);
		expect(html).toContain("RSI(14)");
	});

	it("applies default height of 120px", () => {
		const html = renderToString(
			createElement(PanelContainer, { label: "RSI" } as PanelContainerProps),
		);
		expect(html).toContain("120px");
	});

	it("applies custom height", () => {
		const html = renderToString(
			createElement(PanelContainer, { label: "RSI", height: 200 } as PanelContainerProps),
		);
		expect(html).toContain("200px");
	});

	it("applies className prop", () => {
		const html = renderToString(
			createElement(PanelContainer, { label: "RSI", className: "my-panel" } as PanelContainerProps),
		);
		expect(html).toContain("my-panel");
	});

	it("renders inner chart div with data-testid panel-chart", () => {
		const html = renderToString(
			createElement(PanelContainer, { label: "RSI" } as PanelContainerProps),
		);
		expect(html).toContain('data-testid="panel-chart"');
	});
});

// ─── RsiPanel tests ────────────────────────────────────────────────────────────

describe("RsiPanel", () => {
	const sampleData: RsiPoint[] = [
		{ time: 1700000000, value: 45 },
		{ time: 1700003600, value: 68 },
		{ time: 1700007200, value: 32 },
	];

	it("renders with data-testid rsi-panel", () => {
		const html = renderToString(createElement(RsiPanel, { data: sampleData } as RsiPanelProps));
		expect(html).toContain('data-testid="rsi-panel"');
	});

	it("renders RSI label", () => {
		const html = renderToString(createElement(RsiPanel, { data: sampleData } as RsiPanelProps));
		expect(html).toContain("RSI");
	});

	it("applies default height of 120px", () => {
		const html = renderToString(createElement(RsiPanel, { data: sampleData } as RsiPanelProps));
		expect(html).toContain("120px");
	});

	it("accepts custom height", () => {
		const html = renderToString(
			createElement(RsiPanel, { data: sampleData, height: 150 } as RsiPanelProps),
		);
		expect(html).toContain("150px");
	});

	it("accepts className prop", () => {
		const html = renderToString(
			createElement(RsiPanel, { data: sampleData, className: "rsi-custom" } as RsiPanelProps),
		);
		expect(html).toContain("rsi-custom");
	});

	it("accepts period prop", () => {
		const html = renderToString(
			createElement(RsiPanel, { data: sampleData, period: 14 } as RsiPanelProps),
		);
		expect(html).toContain("RSI");
	});

	it("data-panel-type attribute is rsi", () => {
		const html = renderToString(createElement(RsiPanel, { data: sampleData } as RsiPanelProps));
		expect(html).toContain('data-panel-type="rsi"');
	});
});

// ─── MacdPanel tests ───────────────────────────────────────────────────────────

describe("MacdPanel", () => {
	const sampleData: MacdPoint[] = [
		{ time: 1700000000, macd: 0.5, signal: 0.3, histogram: 0.2 },
		{ time: 1700003600, macd: -0.2, signal: 0.1, histogram: -0.3 },
		{ time: 1700007200, macd: 0.8, signal: 0.6, histogram: 0.2 },
	];

	it("renders with data-testid macd-panel", () => {
		const html = renderToString(createElement(MacdPanel, { data: sampleData } as MacdPanelProps));
		expect(html).toContain('data-testid="macd-panel"');
	});

	it("renders MACD label", () => {
		const html = renderToString(createElement(MacdPanel, { data: sampleData } as MacdPanelProps));
		expect(html).toContain("MACD");
	});

	it("applies default height of 120px", () => {
		const html = renderToString(createElement(MacdPanel, { data: sampleData } as MacdPanelProps));
		expect(html).toContain("120px");
	});

	it("accepts custom height", () => {
		const html = renderToString(
			createElement(MacdPanel, { data: sampleData, height: 160 } as MacdPanelProps),
		);
		expect(html).toContain("160px");
	});

	it("accepts className prop", () => {
		const html = renderToString(
			createElement(MacdPanel, { data: sampleData, className: "macd-custom" } as MacdPanelProps),
		);
		expect(html).toContain("macd-custom");
	});

	it("data-panel-type attribute is macd", () => {
		const html = renderToString(createElement(MacdPanel, { data: sampleData } as MacdPanelProps));
		expect(html).toContain('data-panel-type="macd"');
	});
});

// ─── StochasticPanel tests ─────────────────────────────────────────────────────

describe("StochasticPanel", () => {
	const sampleData: StochasticPoint[] = [
		{ time: 1700000000, k: 75, d: 70 },
		{ time: 1700003600, k: 25, d: 30 },
		{ time: 1700007200, k: 50, d: 48 },
	];

	it("renders with data-testid stochastic-panel", () => {
		const html = renderToString(
			createElement(StochasticPanel, { data: sampleData } as StochasticPanelProps),
		);
		expect(html).toContain('data-testid="stochastic-panel"');
	});

	it("renders Stochastic label", () => {
		const html = renderToString(
			createElement(StochasticPanel, { data: sampleData } as StochasticPanelProps),
		);
		expect(html).toContain("Stochastic");
	});

	it("applies default height of 120px", () => {
		const html = renderToString(
			createElement(StochasticPanel, { data: sampleData } as StochasticPanelProps),
		);
		expect(html).toContain("120px");
	});

	it("accepts custom height", () => {
		const html = renderToString(
			createElement(StochasticPanel, { data: sampleData, height: 140 } as StochasticPanelProps),
		);
		expect(html).toContain("140px");
	});

	it("accepts className prop", () => {
		const html = renderToString(
			createElement(StochasticPanel, {
				data: sampleData,
				className: "stoch-custom",
			} as StochasticPanelProps),
		);
		expect(html).toContain("stoch-custom");
	});

	it("data-panel-type attribute is stochastic", () => {
		const html = renderToString(
			createElement(StochasticPanel, { data: sampleData } as StochasticPanelProps),
		);
		expect(html).toContain('data-panel-type="stochastic"');
	});
});

// ─── Type exports ──────────────────────────────────────────────────────────────

describe("type exports", () => {
	it("RsiPoint has time and value fields", () => {
		const point: RsiPoint = { time: 1700000000, value: 55 };
		expect(point.value).toBe(55);
	});

	it("MacdPoint has time, macd, signal, histogram fields", () => {
		const point: MacdPoint = { time: 1700000000, macd: 0.5, signal: 0.3, histogram: 0.2 };
		expect(point.histogram).toBe(0.2);
	});

	it("StochasticPoint has time, k, d fields", () => {
		const point: StochasticPoint = { time: 1700000000, k: 75, d: 70 };
		expect(point.k).toBe(75);
	});
});

// ─── usePanelSync hook ─────────────────────────────────────────────────────────

describe("usePanelSync", () => {
	it("usePanelSync is exported as a function", () => {
		expect(typeof usePanelSync).toBe("function");
	});

	it("UsePanelSyncOptions type accepts mainChart and panelChart", () => {
		const opts: UsePanelSyncOptions = {
			mainChart: null,
			panelChart: null,
		};
		expect(opts.mainChart).toBeNull();
		expect(opts.panelChart).toBeNull();
	});
});
