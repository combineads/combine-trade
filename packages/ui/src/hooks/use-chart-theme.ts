"use client";

import { useContext } from "react";
import { ThemeContext } from "../theme/theme-provider";

/**
 * Chart theme tokens derived from docs/DESIGN_SYSTEM.md §5.6 and §14.
 * Candle colors and series colors are theme-invariant.
 * Background, grid, crosshair, and scale text vary by theme.
 */
export interface ChartTheme {
	/** Chart canvas background */
	background: string;
	/** Grid line color */
	grid: string;
	/** Crosshair color */
	crosshair: string;
	/** Price/time scale text color */
	scaleText: string;
	/** Bullish (up) candle color — theme-invariant */
	bullish: string;
	/** Bearish (down) candle color — theme-invariant */
	bearish: string;
	/** SMA series color — theme-invariant */
	sma: string;
	/** EMA series color — theme-invariant */
	ema: string;
	/** Bollinger Bands line color — theme-invariant */
	bbLine: string;
	/** Bollinger Bands fill color — theme-invariant */
	bbFill: string;
}

const SERIES_COLORS = {
	bullish: "#22C55E",
	bearish: "#EF4444",
	sma: "#3B82F6",
	ema: "#8B5CF6",
	bbLine: "#64748B",
	bbFill: "rgba(100,116,139,0.06)",
} as const;

/** Pre-built chart theme objects for dark and light modes. */
export const CHART_THEMES: Readonly<Record<"dark" | "light", ChartTheme>> = {
	dark: {
		background: "#0A0A0F",
		grid: "#1E293B",
		crosshair: "#334155",
		scaleText: "#94A3B8",
		...SERIES_COLORS,
	},
	light: {
		background: "#FFFFFF",
		grid: "#E2E8F0",
		crosshair: "#CBD5E1",
		scaleText: "#475569",
		...SERIES_COLORS,
	},
};

/**
 * Convert a ChartTheme into TradingView Lightweight Charts `DeepPartial<ChartOptions>`.
 * Works with lightweight-charts v4/v5 — compatible with the options accepted by
 * `createChart()` and `chart.applyOptions()`.
 */
export function toLightweightChartsOptions(theme: ChartTheme): {
	layout?: {
		background?: { color: string };
		textColor?: string;
	};
	grid?: {
		vertLines?: { color: string };
		horzLines?: { color: string };
	};
	crosshair?: {
		vertLine?: { color: string };
		horzLine?: { color: string };
	};
} {
	return {
		layout: {
			background: { color: theme.background },
			textColor: theme.scaleText,
		},
		grid: {
			vertLines: { color: theme.grid },
			horzLines: { color: theme.grid },
		},
		crosshair: {
			vertLine: { color: theme.crosshair },
			horzLine: { color: theme.crosshair },
		},
	};
}

/**
 * React hook that returns the current chart theme based on the active
 * application theme (dark / light).
 *
 * Falls back to dark theme when used outside a ThemeProvider (e.g. SSR
 * or test environments without a provider), so callers never receive null.
 *
 * Usage:
 *   const chartTheme = useChartTheme();
 *   const lwOpts = toLightweightChartsOptions(chartTheme);
 *   chart.applyOptions(lwOpts);
 */
export function useChartTheme(): ChartTheme {
	const ctx = useContext(ThemeContext);
	const activeTheme = ctx?.theme ?? "dark";
	return CHART_THEMES[activeTheme];
}
