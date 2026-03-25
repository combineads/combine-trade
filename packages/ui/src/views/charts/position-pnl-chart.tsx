"use client";

import { useEffect, useRef } from "react";
import { toLightweightChartsOptions, useChartTheme } from "../../hooks/use-chart-theme";

// ---------------------------------------------------------------------------
// Design system color tokens for PnL (from DESIGN_SYSTEM.md §5.6)
// ---------------------------------------------------------------------------

/** Green for positive PnL — maps to design system `success` token */
const SUCCESS_COLOR = "#22C55E";
/** Red for negative PnL — maps to design system `danger` token */
const DANGER_COLOR = "#EF4444";

// ---------------------------------------------------------------------------
// useSseConnection — extracted SSE lifecycle hook (REFACTOR step)
// ---------------------------------------------------------------------------

interface SseConnectionOptions {
	url: string;
	/** Called with each raw MessageEvent data string */
	onMessage: (data: string) => void;
}

/**
 * Manages an SSE connection lifecycle: opens on mount, closes on unmount.
 * Returns a no-op when EventSource is unavailable (SSR / test).
 */
function useSseConnection({ url, onMessage }: SseConnectionOptions): void {
	const onMessageRef = useRef(onMessage);
	onMessageRef.current = onMessage;

	useEffect(() => {
		if (typeof globalThis.EventSource === "undefined") return;

		const es = new EventSource(url, { withCredentials: true });

		es.onmessage = (e: MessageEvent) => {
			onMessageRef.current(e.data as string);
		};

		return () => {
			es.close();
		};
	}, [url]);
}

// ---------------------------------------------------------------------------
// PositionPnlChart
// ---------------------------------------------------------------------------

export interface PositionPnlChartProps {
	/** Position ID — used to construct the SSE endpoint URL */
	positionId: string;
	/** Optional API base URL (e.g. "https://api.example.com") */
	apiBaseUrl?: string;
	height?: number;
	className?: string;
}

/**
 * Real-time line chart showing unrealized PnL for an open position.
 *
 * - Opens an SSE connection to `/api/v1/positions/:positionId/pnl/stream`
 * - Each SSE event carries `{ time: number; pnl: string }` (Decimal.js string)
 * - Updates the Lightweight Charts line series in real time
 * - SSE connection is closed on component unmount (no leak)
 */
export function PositionPnlChart({
	positionId,
	apiBaseUrl = "",
	height = 300,
	className,
}: PositionPnlChartProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const chartRef = useRef<unknown>(null);
	const theme = useChartTheme();

	const sseUrl = `${apiBaseUrl}/api/v1/positions/${positionId}/pnl/stream`;

	// Set up chart on mount
	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		let disposed = false;

		(async () => {
			try {
				const { createChart, LineSeries } = await import("lightweight-charts");
				if (disposed) return;

				const themeOptions = toLightweightChartsOptions(theme);
				const chart = createChart(container, {
					width: container.clientWidth,
					height,
					...themeOptions,
					rightPriceScale: { visible: true },
				});

				const lineSeries = chart.addSeries(LineSeries, {
					color: SUCCESS_COLOR,
					lineWidth: 2,
				});

				chartRef.current = { chart, lineSeries };

				const observer = new ResizeObserver((entries) => {
					for (const entry of entries) {
						chart.applyOptions({ width: entry.contentRect.width });
					}
				});
				observer.observe(container);
				// biome-ignore lint/suspicious/noExplicitAny: TradingView Lightweight Charts API requires any
				(chartRef.current as any).observer = observer;
			} catch {
				/* lightweight-charts not available in SSR/test */
			}
		})();

		return () => {
			disposed = true;
			// biome-ignore lint/suspicious/noExplicitAny: TradingView Lightweight Charts API requires any
			const ref = chartRef.current as any;
			if (ref) {
				ref.observer?.disconnect();
				ref.chart?.remove();
				chartRef.current = null;
			}
		};
	}, [height, theme]);

	// Subscribe to SSE updates and push data points to the chart
	useSseConnection({
		url: sseUrl,
		onMessage: (data) => {
			try {
				const parsed = JSON.parse(data) as { time: number; pnl: string };
				const value = Number(parsed.pnl);
				// biome-ignore lint/suspicious/noExplicitAny: TradingView Lightweight Charts API requires any
				const ref = chartRef.current as any;
				if (ref?.lineSeries) {
					// Update line color based on current PnL direction
					ref.lineSeries.applyOptions({
						color: value >= 0 ? SUCCESS_COLOR : DANGER_COLOR,
					});
					// biome-ignore lint/suspicious/noExplicitAny: TradingView Lightweight Charts API requires any
					ref.lineSeries.update({ time: parsed.time as any, value });
				}
			} catch {
				/* ignore malformed SSE events */
			}
		},
	});

	return (
		<div
			ref={containerRef}
			data-testid="position-pnl-chart"
			className={className}
			style={{ height: `${height}px`, width: "100%" }}
		/>
	);
}

// ---------------------------------------------------------------------------
// DailyPnlChart
// ---------------------------------------------------------------------------

export interface DailyPnlBar {
	/** Unix timestamp (seconds) for the day */
	time: number;
	/** Realized PnL for the day — Decimal.js string from the API */
	pnl: string;
}

export interface DailyPnlChartProps {
	data: DailyPnlBar[];
	height?: number;
	className?: string;
}

/**
 * Bar (histogram) chart showing daily realized PnL.
 *
 * - Data is fetched once on mount and passed as `data` prop
 * - Positive bars use the design system `success` token (#22C55E)
 * - Negative bars use the design system `danger` token (#EF4444)
 * - All PnL string values are parsed via `Number()` before rendering
 */
export function DailyPnlChart({ data, height = 300, className }: DailyPnlChartProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const chartRef = useRef<unknown>(null);
	const theme = useChartTheme();

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		let disposed = false;

		(async () => {
			try {
				const { createChart, HistogramSeries } = await import("lightweight-charts");
				if (disposed) return;

				const themeOptions = toLightweightChartsOptions(theme);
				const chart = createChart(container, {
					width: container.clientWidth,
					height,
					...themeOptions,
					rightPriceScale: { visible: true },
				});

				const histogramSeries = chart.addSeries(HistogramSeries, {
					color: SUCCESS_COLOR,
					priceFormat: { type: "price", precision: 2, minMove: 0.01 },
				});

				if (data.length > 0) {
					histogramSeries.setData(
						data.map((bar) => {
							const value = Number(bar.pnl);
							return {
								// biome-ignore lint/suspicious/noExplicitAny: TradingView Lightweight Charts API requires any
								time: bar.time as any,
								value,
								color: value >= 0 ? SUCCESS_COLOR : DANGER_COLOR,
							};
						}),
					);
				}

				chartRef.current = { chart, histogramSeries };

				const observer = new ResizeObserver((entries) => {
					for (const entry of entries) {
						chart.applyOptions({ width: entry.contentRect.width });
					}
				});
				observer.observe(container);
				// biome-ignore lint/suspicious/noExplicitAny: TradingView Lightweight Charts API requires any
				(chartRef.current as any).observer = observer;
			} catch {
				/* lightweight-charts not available in SSR/test */
			}
		})();

		return () => {
			disposed = true;
			// biome-ignore lint/suspicious/noExplicitAny: TradingView Lightweight Charts API requires any
			const ref = chartRef.current as any;
			if (ref) {
				ref.observer?.disconnect();
				ref.chart?.remove();
				chartRef.current = null;
			}
		};
	}, [data, height, theme]);

	return (
		<div
			ref={containerRef}
			data-testid="daily-pnl-chart"
			className={className}
			style={{ height: `${height}px`, width: "100%" }}
		/>
	);
}
