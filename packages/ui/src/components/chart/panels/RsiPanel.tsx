"use client";

import { PanelContainer } from "./PanelContainer";

export interface RsiPoint {
	/** Unix timestamp (seconds). */
	time: number;
	/** RSI value in range [0, 100]. */
	value: number;
}

export interface RsiPanelProps {
	/** RSI data points. */
	data: RsiPoint[];
	/** RSI period for display label (default 14). */
	period?: number;
	/** Panel height in pixels. Defaults to 120. */
	height?: number;
	/** Optional CSS class applied to the outer wrapper. */
	className?: string;
	/** Optional main chart instance for crosshair/range synchronization. */
	mainChart?: unknown | null;
}

/**
 * RsiPanel
 *
 * Renders RSI as a line series inside a PanelContainer.
 * Adds 30 and 70 horizontal price lines as reference zones
 * (overbought / oversold).
 */
export function RsiPanel({ data, period = 14, height = 120, className, mainChart }: RsiPanelProps) {
	const label = `RSI(${period})`;

	const handleRender = (chart: unknown): (() => void) | undefined => {
		// biome-ignore lint/suspicious/noExplicitAny: lightweight-charts dynamic import - types loaded at runtime
		const c = chart as any;

		(async () => {
			try {
				const { LineSeries } = await import("lightweight-charts");

				const series = c.addSeries(LineSeries, {
					color: "#8B5CF6",
					lineWidth: 1,
					priceLineVisible: false,
					lastValueVisible: false,
					// Fix y-axis to [0, 100]
					autoscaleInfoProvider: () => ({
						priceRange: { minValue: 0, maxValue: 100 },
					}),
				});

				if (data.length > 0) {
					// biome-ignore lint/suspicious/noExplicitAny: lightweight-charts API
					series.setData(data as any);
				}

				// Oversold line at 30
				series.createPriceLine({
					price: 30,
					color: "#22C55E",
					lineWidth: 1,
					lineStyle: 2, // dashed
					axisLabelVisible: true,
					title: "30",
				});

				// Overbought line at 70
				series.createPriceLine({
					price: 70,
					color: "#EF4444",
					lineWidth: 1,
					lineStyle: 2, // dashed
					axisLabelVisible: true,
					title: "70",
				});

				// Store series reference for cleanup
				c.__rsiSeries = series;
			} catch {
				// lightweight-charts not available in SSR/test
			}
		})();

		return () => {
			try {
				if (c.__rsiSeries) {
					c.removeSeries?.(c.__rsiSeries);
					c.__rsiSeries = null;
				}
			} catch {
				// ignore cleanup errors
			}
		};
	};

	return (
		<div data-testid="rsi-panel" data-panel-type="rsi" className={className}>
			<PanelContainer label={label} height={height} mainChart={mainChart} onRender={handleRender} />
		</div>
	);
}
