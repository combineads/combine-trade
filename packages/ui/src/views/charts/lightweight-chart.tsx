"use client";

import { useEffect, useRef } from "react";

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

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		let disposed = false;

		(async () => {
			try {
				const { createChart, CandlestickSeries } = await import("lightweight-charts");
				if (disposed) return;

				const style = getComputedStyle(container);
				const bg = style.getPropertyValue("--color-surface").trim() || "#1a1a2e";
				const text = style.getPropertyValue("--color-text-primary").trim() || "#e0e0e0";
				const grid = style.getPropertyValue("--color-border").trim() || "#2a2a3e";
				const up = style.getPropertyValue("--color-success").trim() || "#22c55e";
				const down = style.getPropertyValue("--color-danger").trim() || "#ef4444";

				const chart = createChart(container, {
					width: container.clientWidth,
					height,
					layout: { background: { color: bg }, textColor: text },
					grid: {
						vertLines: { color: grid },
						horzLines: { color: grid },
					},
				});

				const series = chart.addSeries(CandlestickSeries, {
					upColor: up,
					downColor: down,
					borderUpColor: up,
					borderDownColor: down,
					wickUpColor: up,
					wickDownColor: down,
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
	}, [data, height]);

	return (
		<div
			ref={containerRef}
			data-testid="lightweight-chart"
			className={className}
			style={{ height: `${height}px`, width: "100%" }}
		/>
	);
}
