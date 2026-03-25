"use client";

import { type ReactNode, useEffect, useRef } from "react";
import { toLightweightChartsOptions, useChartTheme } from "../../../hooks/use-chart-theme";
import { usePanelSync } from "./use-panel-sync";

export interface PanelContainerProps {
	/** Display label shown above the panel chart (e.g. "RSI(14)"). */
	label: string;
	/** Panel height in pixels. Defaults to 120. */
	height?: number;
	/** Optional additional CSS class applied to the outer wrapper. */
	className?: string;
	/** Optional main chart instance for crosshair/range synchronization. */
	mainChart?: unknown | null;
	/** Callback fired once the internal chart instance is created. */
	onChartReady?: (chart: unknown) => void;
	/** Callback to render series inside the chart once it is created. Returns optional cleanup. */
	onRender?: (chart: unknown) => (() => void) | undefined;
	children?: ReactNode;
}

/**
 * PanelContainer
 *
 * Shared layout wrapper for sub-panel indicator charts.  Each instance
 * creates its own `createChart` instance and synchronizes its crosshair and
 * visible range with the supplied `mainChart` via `usePanelSync`.
 *
 * The `onRender` callback receives the chart instance and is responsible for
 * adding series (RSI line, MACD histogram, etc.).  It may return a cleanup
 * function that will be called when the component unmounts.
 */
export function PanelContainer({
	label,
	height = 120,
	className,
	mainChart = null,
	onChartReady,
	onRender,
}: PanelContainerProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const chartRef = useRef<unknown>(null);
	const theme = useChartTheme();

	// Stable refs so useEffect deps stay minimal
	const onChartReadyRef = useRef(onChartReady);
	onChartReadyRef.current = onChartReady;
	const onRenderRef = useRef(onRender);
	onRenderRef.current = onRender;

	// Synchronize crosshair and range with main chart
	usePanelSync({ mainChart, panelChart: chartRef.current });

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		let disposed = false;
		let userCleanup: (() => void) | undefined;

		(async () => {
			try {
				const { createChart } = await import("lightweight-charts");
				if (disposed) return;

				const themeOptions = toLightweightChartsOptions(theme);

				const chart = createChart(container, {
					width: container.clientWidth,
					height,
					...themeOptions,
					// Remove right price scale padding for compact panel layout
					rightPriceScale: { borderVisible: false },
					timeScale: { borderVisible: false, visible: false },
					handleScroll: false,
					handleScale: false,
				});

				chartRef.current = chart;
				onChartReadyRef.current?.(chart);

				// Let the specific panel add its series
				userCleanup = onRenderRef.current?.(chart);

				const observer = new ResizeObserver((entries) => {
					for (const entry of entries) {
						chart.applyOptions({ width: entry.contentRect.width });
					}
				});
				observer.observe(container);

				// biome-ignore lint/suspicious/noExplicitAny: lightweight-charts dynamic import
				(chartRef.current as any).__observer = observer;
			} catch {
				// lightweight-charts not available in SSR/test environment
			}
		})();

		return () => {
			disposed = true;
			userCleanup?.();
			// biome-ignore lint/suspicious/noExplicitAny: lightweight-charts dynamic import
			const ref = chartRef.current as any;
			if (ref) {
				ref.__observer?.disconnect();
				ref.remove?.();
				chartRef.current = null;
			}
		};
	}, [height, theme]);

	return (
		<div
			data-testid="panel-container"
			className={className}
			style={{ width: "100%", height: `${height}px` }}
		>
			<div
				style={{
					fontSize: 11,
					color: "var(--text-secondary, #94A3B8)",
					padding: "2px 6px",
					userSelect: "none",
				}}
			>
				{label}
			</div>
			<div
				ref={containerRef}
				data-testid="panel-chart"
				style={{ width: "100%", height: `${height - 18}px` }}
			/>
		</div>
	);
}
