"use client";

import { PanelContainer } from "./PanelContainer";

export interface MacdPoint {
	/** Unix timestamp (seconds). */
	time: number;
	/** MACD line value. */
	macd: number;
	/** Signal line value. */
	signal: number;
	/** Histogram value (MACD − signal). */
	histogram: number;
}

export interface MacdPanelProps {
	/** MACD data points. */
	data: MacdPoint[];
	/** Panel height in pixels. Defaults to 120. */
	height?: number;
	/** Optional CSS class applied to the outer wrapper. */
	className?: string;
	/** Optional main chart instance for crosshair/range synchronization. */
	mainChart?: unknown | null;
}

/**
 * MacdPanel
 *
 * Renders three series inside a PanelContainer:
 * - Histogram (MACD − signal) as a HistogramSeries — green above zero, red below
 * - MACD line as a LineSeries
 * - Signal line as a LineSeries
 */
export function MacdPanel({ data, height = 120, className, mainChart }: MacdPanelProps) {
	const handleRender = (chart: unknown): (() => void) | undefined => {
		// biome-ignore lint/suspicious/noExplicitAny: lightweight-charts dynamic import - types loaded at runtime
		const c = chart as any;

		(async () => {
			try {
				const { HistogramSeries, LineSeries } = await import("lightweight-charts");

				// Histogram series
				const histogramSeries = c.addSeries(HistogramSeries, {
					priceLineVisible: false,
					lastValueVisible: false,
					color: "#22C55E",
				});

				// MACD line
				const macdSeries = c.addSeries(LineSeries, {
					color: "#3B82F6",
					lineWidth: 1,
					priceLineVisible: false,
					lastValueVisible: false,
				});

				// Signal line
				const signalSeries = c.addSeries(LineSeries, {
					color: "#F59E0B",
					lineWidth: 1,
					priceLineVisible: false,
					lastValueVisible: false,
				});

				if (data.length > 0) {
					const histogramData = data.map((d) => ({
						time: d.time,
						value: d.histogram,
						color: d.histogram >= 0 ? "#22C55E" : "#EF4444",
					}));
					const macdData = data.map((d) => ({ time: d.time, value: d.macd }));
					const signalData = data.map((d) => ({ time: d.time, value: d.signal }));

					// biome-ignore lint/suspicious/noExplicitAny: lightweight-charts API
					histogramSeries.setData(histogramData as any);
					// biome-ignore lint/suspicious/noExplicitAny: lightweight-charts API
					macdSeries.setData(macdData as any);
					// biome-ignore lint/suspicious/noExplicitAny: lightweight-charts API
					signalSeries.setData(signalData as any);
				}

				c.__macdSeries = { histogramSeries, macdSeries, signalSeries };
			} catch {
				// lightweight-charts not available in SSR/test
			}
		})();

		return () => {
			try {
				if (c.__macdSeries) {
					c.removeSeries?.(c.__macdSeries.histogramSeries);
					c.removeSeries?.(c.__macdSeries.macdSeries);
					c.removeSeries?.(c.__macdSeries.signalSeries);
					c.__macdSeries = null;
				}
			} catch {
				// ignore cleanup errors
			}
		};
	};

	return (
		<div data-testid="macd-panel" data-panel-type="macd" className={className}>
			<PanelContainer label="MACD" height={height} mainChart={mainChart} onRender={handleRender} />
		</div>
	);
}
