"use client";

import { PanelContainer } from "./PanelContainer";

export interface StochasticPoint {
	/** Unix timestamp (seconds). */
	time: number;
	/** %K value in range [0, 100]. */
	k: number;
	/** %D value in range [0, 100]. */
	d: number;
}

export interface StochasticPanelProps {
	/** Stochastic data points. */
	data: StochasticPoint[];
	/** Panel height in pixels. Defaults to 120. */
	height?: number;
	/** Optional CSS class applied to the outer wrapper. */
	className?: string;
	/** Optional main chart instance for crosshair/range synchronization. */
	mainChart?: unknown | null;
}

/**
 * StochasticPanel
 *
 * Renders two line series inside a PanelContainer:
 * - %K line (fast stochastic)
 * - %D line (slow stochastic / signal)
 *
 * Adds 20 and 80 horizontal price lines as oversold/overbought reference zones.
 */
export function StochasticPanel({
	data,
	height = 120,
	className,
	mainChart,
}: StochasticPanelProps) {
	const handleRender = (chart: unknown): (() => void) | undefined => {
		// biome-ignore lint/suspicious/noExplicitAny: lightweight-charts dynamic import - types loaded at runtime
		const c = chart as any;

		(async () => {
			try {
				const { LineSeries } = await import("lightweight-charts");

				const autoscaleInfo = () => ({
					priceRange: { minValue: 0, maxValue: 100 },
				});

				// %K line
				const kSeries = c.addSeries(LineSeries, {
					color: "#3B82F6",
					lineWidth: 1,
					priceLineVisible: false,
					lastValueVisible: false,
					autoscaleInfoProvider: autoscaleInfo,
				});

				// %D line
				const dSeries = c.addSeries(LineSeries, {
					color: "#F59E0B",
					lineWidth: 1,
					priceLineVisible: false,
					lastValueVisible: false,
					autoscaleInfoProvider: autoscaleInfo,
				});

				if (data.length > 0) {
					const kData = data.map((p) => ({ time: p.time, value: p.k }));
					const dData = data.map((p) => ({ time: p.time, value: p.d }));
					// biome-ignore lint/suspicious/noExplicitAny: lightweight-charts API
					kSeries.setData(kData as any);
					// biome-ignore lint/suspicious/noExplicitAny: lightweight-charts API
					dSeries.setData(dData as any);
				}

				// Oversold line at 20
				kSeries.createPriceLine({
					price: 20,
					color: "#22C55E",
					lineWidth: 1,
					lineStyle: 2, // dashed
					axisLabelVisible: true,
					title: "20",
				});

				// Overbought line at 80
				kSeries.createPriceLine({
					price: 80,
					color: "#EF4444",
					lineWidth: 1,
					lineStyle: 2, // dashed
					axisLabelVisible: true,
					title: "80",
				});

				c.__stochSeries = { kSeries, dSeries };
			} catch {
				// lightweight-charts not available in SSR/test
			}
		})();

		return () => {
			try {
				if (c.__stochSeries) {
					c.removeSeries?.(c.__stochSeries.kSeries);
					c.removeSeries?.(c.__stochSeries.dSeries);
					c.__stochSeries = null;
				}
			} catch {
				// ignore cleanup errors
			}
		};
	};

	return (
		<div data-testid="stochastic-panel" data-panel-type="stochastic" className={className}>
			<PanelContainer
				label="Stochastic"
				height={height}
				mainChart={mainChart}
				onRender={handleRender}
			/>
		</div>
	);
}
