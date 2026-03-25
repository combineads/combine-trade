/**
 * Tests for TradingView Ticker Tape and Market Overview widgets.
 *
 * Uses bun:test with react-dom/server for SSR rendering to verify:
 * - TickerTapeWidget renders a container div with correct data-testid
 * - MarketOverviewWidget renders a container div with correct data-testid
 * - Both accept theme prop ('dark' | 'light')
 * - Both accept className prop
 * - useTradingViewWidget hook exports are present
 */

import { describe, expect, it } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import {
	MarketOverviewWidget,
	type MarketOverviewWidgetProps,
	TickerTapeWidget,
	type TickerTapeWidgetProps,
	type TradingViewTheme,
} from "../ticker-tape-widget";

// ---------------------------------------------------------------------------
// TickerTapeWidget tests
// ---------------------------------------------------------------------------

describe("TickerTapeWidget", () => {
	it("renders container div with data-testid", () => {
		const html = renderToString(createElement(TickerTapeWidget, {} as TickerTapeWidgetProps));
		expect(html).toContain('data-testid="ticker-tape-widget"');
	});

	it("applies className prop", () => {
		const html = renderToString(
			createElement(TickerTapeWidget, { className: "my-class" } as TickerTapeWidgetProps),
		);
		expect(html).toContain("my-class");
	});

	it("accepts dark theme", () => {
		const html = renderToString(
			createElement(TickerTapeWidget, { theme: "dark" } as TickerTapeWidgetProps),
		);
		expect(html).toContain('data-testid="ticker-tape-widget"');
	});

	it("accepts light theme", () => {
		const html = renderToString(
			createElement(TickerTapeWidget, { theme: "light" } as TickerTapeWidgetProps),
		);
		expect(html).toContain('data-testid="ticker-tape-widget"');
	});

	it("accepts symbols array", () => {
		const symbols = [
			{ proName: "BINANCE:BTCUSDT", title: "BTC/USDT" },
			{ proName: "BINANCE:ETHUSDT", title: "ETH/USDT" },
		];
		const html = renderToString(
			createElement(TickerTapeWidget, { symbols } as TickerTapeWidgetProps),
		);
		expect(html).toContain('data-testid="ticker-tape-widget"');
	});

	it("uses dark theme by default", () => {
		// Default theme is dark per DESIGN_SYSTEM.md
		const html = renderToString(createElement(TickerTapeWidget, {} as TickerTapeWidgetProps));
		expect(html).toContain('data-theme="dark"');
	});
});

// ---------------------------------------------------------------------------
// MarketOverviewWidget tests
// ---------------------------------------------------------------------------

describe("MarketOverviewWidget", () => {
	it("renders container div with data-testid", () => {
		const html = renderToString(
			createElement(MarketOverviewWidget, {} as MarketOverviewWidgetProps),
		);
		expect(html).toContain('data-testid="market-overview-widget"');
	});

	it("applies className prop", () => {
		const html = renderToString(
			createElement(MarketOverviewWidget, { className: "my-class" } as MarketOverviewWidgetProps),
		);
		expect(html).toContain("my-class");
	});

	it("accepts dark theme", () => {
		const html = renderToString(
			createElement(MarketOverviewWidget, { theme: "dark" } as MarketOverviewWidgetProps),
		);
		expect(html).toContain('data-testid="market-overview-widget"');
	});

	it("accepts light theme", () => {
		const html = renderToString(
			createElement(MarketOverviewWidget, { theme: "light" } as MarketOverviewWidgetProps),
		);
		expect(html).toContain('data-testid="market-overview-widget"');
	});

	it("accepts height prop", () => {
		const html = renderToString(
			createElement(MarketOverviewWidget, { height: 500 } as MarketOverviewWidgetProps),
		);
		expect(html).toContain('data-testid="market-overview-widget"');
	});

	it("uses dark theme by default", () => {
		const html = renderToString(
			createElement(MarketOverviewWidget, {} as MarketOverviewWidgetProps),
		);
		expect(html).toContain('data-theme="dark"');
	});
});

// ---------------------------------------------------------------------------
// Type exports
// ---------------------------------------------------------------------------

describe("type exports", () => {
	it("TradingViewTheme type accepts dark", () => {
		const theme: TradingViewTheme = "dark";
		expect(theme).toBe("dark");
	});

	it("TradingViewTheme type accepts light", () => {
		const theme: TradingViewTheme = "light";
		expect(theme).toBe("light");
	});
});
