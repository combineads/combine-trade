"use client";

import { useEffect, useRef } from "react";
import { toLightweightChartsOptions, useChartTheme } from "../../hooks/use-chart-theme";

export interface OHLCVBar {
	time: number;
	open: number;
	high: number;
	low: number;
	close: number;
	volume?: number;
}

export interface LightweightChartProps {
	data: OHLCVBar[];
	height?: number;
	className?: string;
}

export function LightweightChart({ data, height = 400, className }: LightweightChartProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const chartRef = useRef<unknown>(null);
	const theme = useChartTheme();

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		let disposed = false;

		(async () => {
			try {
				const { createChart, CandlestickSeries } = await import("lightweight-charts");
				if (disposed) return;

				const themeOptions = toLightweightChartsOptions(theme);

				const chart = createChart(container, {
					width: container.clientWidth,
					height,
					...themeOptions,
				});

				const series = chart.addSeries(CandlestickSeries, {
					upColor: theme.bullish,
					downColor: theme.bearish,
					borderUpColor: theme.bullish,
					borderDownColor: theme.bearish,
					wickUpColor: theme.bullish,
					wickDownColor: theme.bearish,
				});

				if (data.length > 0) {
					// biome-ignore lint/suspicious/noExplicitAny: TradingView Lightweight Charts API requires any
					series.setData(data as any);
				}

				chartRef.current = { chart, series };

				const observer = new ResizeObserver((entries) => {
					for (const entry of entries) {
						chart.applyOptions({ width: entry.contentRect.width });
					}
				});
				observer.observe(container);

				// Store cleanup reference
				// biome-ignore lint/suspicious/noExplicitAny: TradingView Lightweight Charts API requires any
				(chartRef.current as any).observer = observer;
			} catch {
				// lightweight-charts not available in SSR/test
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
			data-testid="lightweight-chart"
			className={className}
			style={{ height: `${height}px`, width: "100%" }}
		/>
	);
}
