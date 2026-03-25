"use client";

import { useRef } from "react";
import { useTradingViewWidget } from "../../hooks/use-tradingview-widget";

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export type TradingViewTheme = "dark" | "light";

export interface TickerTapeSymbol {
	/** TradingView symbol identifier, e.g. "BINANCE:BTCUSDT" */
	proName: string;
	/** Display title, e.g. "BTC/USDT" */
	title: string;
}

// ---------------------------------------------------------------------------
// Default crypto symbols for the ticker tape
// ---------------------------------------------------------------------------

const DEFAULT_TICKER_SYMBOLS: TickerTapeSymbol[] = [
	{ proName: "BINANCE:BTCUSDT", title: "BTC/USDT" },
	{ proName: "BINANCE:ETHUSDT", title: "ETH/USDT" },
	{ proName: "BINANCE:BNBUSDT", title: "BNB/USDT" },
	{ proName: "BINANCE:SOLUSDT", title: "SOL/USDT" },
	{ proName: "BINANCE:XRPUSDT", title: "XRP/USDT" },
	{ proName: "BINANCE:ADAUSDT", title: "ADA/USDT" },
	{ proName: "BINANCE:DOGEUSDT", title: "DOGE/USDT" },
	{ proName: "BINANCE:AVAXUSDT", title: "AVAX/USDT" },
];

// ---------------------------------------------------------------------------
// TickerTapeWidget
// ---------------------------------------------------------------------------

export interface TickerTapeWidgetProps {
	/** Override the default symbol list */
	symbols?: TickerTapeSymbol[];
	/** Widget color theme. Defaults to 'dark' (per DESIGN_SYSTEM.md) */
	theme?: TradingViewTheme;
	/** Additional CSS class names */
	className?: string;
}

const TICKER_TAPE_SCRIPT_SRC =
	"https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js";

/**
 * TradingView Ticker Tape widget — horizontal scrolling price ticker.
 *
 * Embeds the free TradingView Ticker Tape widget via script injection.
 * Script is removed and container is cleared on unmount.
 */
export function TickerTapeWidget({
	symbols = DEFAULT_TICKER_SYMBOLS,
	theme = "dark",
	className,
}: TickerTapeWidgetProps) {
	const containerRef = useRef<HTMLDivElement>(null);

	const config: Record<string, unknown> = {
		symbols: symbols.map((s) => ({ proName: s.proName, title: s.title })),
		showSymbolLogo: true,
		isTransparent: false,
		displayMode: "adaptive",
		colorTheme: theme,
		locale: "en",
	};

	useTradingViewWidget({
		scriptSrc: TICKER_TAPE_SCRIPT_SRC,
		config,
		containerRef,
	});

	return (
		<div
			ref={containerRef}
			data-testid="ticker-tape-widget"
			data-theme={theme}
			className={className}
			style={{ width: "100%", overflow: "hidden" }}
		/>
	);
}

// ---------------------------------------------------------------------------
// MarketOverviewWidget
// ---------------------------------------------------------------------------

export interface MarketOverviewTab {
	/** Tab display title */
	title: string;
	/** List of symbols for this tab */
	symbols: Array<{ s: string; d?: string }>;
}

export interface MarketOverviewWidgetProps {
	/** Widget color theme. Defaults to 'dark' */
	theme?: TradingViewTheme;
	/** Widget height in pixels. Defaults to 400 */
	height?: number;
	/** Override default tabs/symbol groups */
	tabs?: MarketOverviewTab[];
	/** Additional CSS class names */
	className?: string;
}

const DEFAULT_MARKET_OVERVIEW_TABS: MarketOverviewTab[] = [
	{
		title: "Crypto",
		symbols: [
			{ s: "BINANCE:BTCUSDT", d: "BTC/USDT" },
			{ s: "BINANCE:ETHUSDT", d: "ETH/USDT" },
			{ s: "BINANCE:BNBUSDT", d: "BNB/USDT" },
			{ s: "BINANCE:SOLUSDT", d: "SOL/USDT" },
			{ s: "BINANCE:XRPUSDT", d: "XRP/USDT" },
			{ s: "BINANCE:ADAUSDT", d: "ADA/USDT" },
			{ s: "BINANCE:DOGEUSDT", d: "DOGE/USDT" },
			{ s: "BINANCE:AVAXUSDT", d: "AVAX/USDT" },
		],
	},
	{
		title: "Futures",
		symbols: [
			{ s: "BINANCE:BTCUSDT.P", d: "BTC Perp" },
			{ s: "BINANCE:ETHUSDT.P", d: "ETH Perp" },
			{ s: "BINANCE:SOLUSDT.P", d: "SOL Perp" },
			{ s: "BINANCE:BNBUSDT.P", d: "BNB Perp" },
		],
	},
];

const MARKET_OVERVIEW_SCRIPT_SRC =
	"https://s3.tradingview.com/external-embedding/embed-widget-market-overview.js";

/**
 * TradingView Market Overview widget — tabbed market snapshot panel.
 *
 * Embeds the free TradingView Market Overview widget via script injection.
 * Script is removed and container is cleared on unmount.
 */
export function MarketOverviewWidget({
	theme = "dark",
	height = 400,
	tabs = DEFAULT_MARKET_OVERVIEW_TABS,
	className,
}: MarketOverviewWidgetProps) {
	const containerRef = useRef<HTMLDivElement>(null);

	const config: Record<string, unknown> = {
		colorTheme: theme,
		dateRange: "12M",
		showChart: true,
		locale: "en",
		largeChartUrl: "",
		isTransparent: false,
		showSymbolLogo: true,
		showFloatingTooltip: false,
		width: "100%",
		height,
		tabs: tabs.map((tab) => ({
			title: tab.title,
			symbols: tab.symbols,
			originalTitle: tab.title,
		})),
	};

	useTradingViewWidget({
		scriptSrc: MARKET_OVERVIEW_SCRIPT_SRC,
		config,
		containerRef,
	});

	return (
		<div
			ref={containerRef}
			data-testid="market-overview-widget"
			data-theme={theme}
			className={className}
			style={{ width: "100%", height: `${height}px`, overflow: "hidden" }}
		/>
	);
}
