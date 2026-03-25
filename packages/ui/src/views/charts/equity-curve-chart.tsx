"use client";

import { useEffect, useRef } from "react";
import { toLightweightChartsOptions, useChartTheme } from "../../hooks/use-chart-theme";

export interface EquityCurvePoint {
	time: number;
	equity: number;
	drawdown: number;
}

export interface EquityCurveChartProps {
	data: EquityCurvePoint[];
	height?: number;
	className?: string;
	initialEquity?: number;
}

export function EquityCurveChart({
	data,
	height = 300,
	className,
	initialEquity: _initialEquity,
}: EquityCurveChartProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const chartRef = useRef<unknown>(null);
	const theme = useChartTheme();

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		let disposed = false;

		(async () => {
			try {
				const { createChart } = await import("lightweight-charts");
				if (disposed) return;

				const themeOptions = toLightweightChartsOptions(theme);

				const chart = createChart(container, {
					width: container.clientWidth,
					height,
					...themeOptions,
					rightPriceScale: { visible: true },
					leftPriceScale: { visible: true },
				});

				const { LineSeries, AreaSeries } = await import("lightweight-charts");

				const equitySeries = chart.addSeries(LineSeries, {
					color: theme.bullish,
					lineWidth: 2,
					priceScaleId: "left",
				});

				const drawdownSeries = chart.addSeries(AreaSeries, {
					topColor: "transparent",
					bottomColor: `${theme.bearish}4d`,
					lineColor: theme.bearish,
					lineWidth: 1,
					priceScaleId: "right",
				});

				if (data.length > 0) {
					// biome-ignore lint/suspicious/noExplicitAny: TradingView Lightweight Charts API requires any
					equitySeries.setData(data.map((d) => ({ time: d.time as any, value: d.equity })));
					drawdownSeries.setData(
						data.map((d) => ({
							// biome-ignore lint/suspicious/noExplicitAny: TradingView Lightweight Charts API requires any
							time: d.time as any,
							value: Math.max(d.drawdown, -1),
						})),
					);
				}

				chartRef.current = { chart, equitySeries, drawdownSeries };

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
			data-testid="equity-curve-chart"
			className={className}
			style={{ height: `${height}px`, width: "100%" }}
		/>
	);
}
