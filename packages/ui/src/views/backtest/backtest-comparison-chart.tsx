"use client";

import { useEffect, useRef } from "react";
import { type Locale, useTranslations } from "../../i18n";

/**
 * A single data point for a version's equity series.
 * `time` is a Unix timestamp (seconds). `drawdown` is a fraction (0 to -1).
 */
export interface VersionEquityPoint {
	time: number;
	equity: number;
	drawdown: number;
}

/** One version's full equity + drawdown series. */
export interface VersionEquitySeries {
	/** Strategy version identifier (e.g. "3"). */
	version: string;
	/** Human-readable label shown in the legend (e.g. "v3"). */
	label: string;
	data: VersionEquityPoint[];
}

export interface BacktestComparisonChartProps {
	series: VersionEquitySeries[];
	/** Height in px for the equity overlay panel. Default: 300. */
	equityHeight?: number;
	/** Height in px for the drawdown comparison panel. Default: 150. */
	drawdownHeight?: number;
	className?: string;
	/** Locale for section labels. Defaults to "ko". */
	locale?: Locale;
}

/**
 * Palette of distinct, accessible line colours — one per version.
 * Repeats if more than 8 versions are compared.
 */
const VERSION_COLORS = [
	"#22c55e", // green
	"#3b82f6", // blue
	"#f59e0b", // amber
	"#a855f7", // purple
	"#ef4444", // red
	"#06b6d4", // cyan
	"#f97316", // orange
	"#84cc16", // lime
];

function getVersionColor(index: number): string {
	return VERSION_COLORS[index % VERSION_COLORS.length];
}

export function BacktestComparisonChart({
	series,
	equityHeight = 300,
	drawdownHeight = 150,
	className,
	locale = "ko",
}: BacktestComparisonChartProps) {
	const t = useTranslations("backtest", locale);

	const equityContainerRef = useRef<HTMLDivElement>(null);
	const drawdownContainerRef = useRef<HTMLDivElement>(null);
	const chartsRef = useRef<unknown>(null);

	useEffect(() => {
		const equityContainer = equityContainerRef.current;
		const drawdownContainer = drawdownContainerRef.current;
		if (!equityContainer || !drawdownContainer || series.length === 0) return;

		let disposed = false;

		(async () => {
			try {
				const { createChart, LineSeries, AreaSeries } = await import("lightweight-charts");
				if (disposed) return;

				const style = getComputedStyle(equityContainer);
				const bg = style.getPropertyValue("--color-surface").trim() || "#1a1a2e";
				const text = style.getPropertyValue("--color-text-primary").trim() || "#e0e0e0";
				const grid = style.getPropertyValue("--color-border").trim() || "#2a2a3e";

				const sharedOptions = {
					layout: { background: { color: bg }, textColor: text },
					grid: { vertLines: { color: grid }, horzLines: { color: grid } },
					crosshair: { mode: 1 /* CROSSHAIR_MODE_NORMAL */ },
					timeScale: { borderColor: grid },
				};

				// --- Equity chart ---
				const equityChart = createChart(equityContainer, {
					...sharedOptions,
					width: equityContainer.clientWidth,
					height: equityHeight,
					rightPriceScale: { visible: true },
				});

				// --- Drawdown chart ---
				const drawdownChart = createChart(drawdownContainer, {
					...sharedOptions,
					width: drawdownContainer.clientWidth,
					height: drawdownHeight,
					rightPriceScale: { visible: true },
				});

				// Add one equity line series and one drawdown area series per version
				const equitySeries = [];
				const drawdownSeriesList = [];

				for (let i = 0; i < series.length; i++) {
					const color = getVersionColor(i);
					const versionData = series[i];

					const eSeries = equityChart.addSeries(LineSeries, {
						color,
						lineWidth: 2,
						title: versionData.label,
					});

					const dSeries = drawdownChart.addSeries(AreaSeries, {
						topColor: "transparent",
						bottomColor: `${color}33`,
						lineColor: color,
						lineWidth: 1,
						title: versionData.label,
					});

					if (versionData.data.length > 0) {
						eSeries.setData(
							// biome-ignore lint/suspicious/noExplicitAny: TradingView Lightweight Charts API requires any
							versionData.data.map((d) => ({ time: d.time as any, value: d.equity })),
						);
						dSeries.setData(
							versionData.data.map((d) => ({
								// biome-ignore lint/suspicious/noExplicitAny: TradingView Lightweight Charts API requires any
								time: d.time as any,
								value: Math.max(d.drawdown, -1),
							})),
						);
					}

					equitySeries.push(eSeries);
					drawdownSeriesList.push(dSeries);
				}

				// Synchronize crosshair between the two charts
				// biome-ignore lint/suspicious/noExplicitAny: TradingView Lightweight Charts API requires any
				equityChart.subscribeCrosshairMove((param: any) => {
					if (!param.time) return;
					drawdownChart.setCrosshairPosition(0, param.time, drawdownSeriesList[0]);
				});
				// biome-ignore lint/suspicious/noExplicitAny: TradingView Lightweight Charts API requires any
				drawdownChart.subscribeCrosshairMove((param: any) => {
					if (!param.time) return;
					equityChart.setCrosshairPosition(0, param.time, equitySeries[0]);
				});

				// biome-ignore lint/suspicious/noExplicitAny: TradingView Lightweight Charts API requires any
				(chartsRef as any).current = { equityChart, drawdownChart };

				// Resize observer covering both containers
				const observerEq = new ResizeObserver((entries) => {
					for (const entry of entries) {
						equityChart.applyOptions({ width: entry.contentRect.width });
					}
				});
				const observerDd = new ResizeObserver((entries) => {
					for (const entry of entries) {
						drawdownChart.applyOptions({ width: entry.contentRect.width });
					}
				});
				observerEq.observe(equityContainer);
				observerDd.observe(drawdownContainer);

				// biome-ignore lint/suspicious/noExplicitAny: TradingView Lightweight Charts API requires any
				(chartsRef as any).current.observerEq = observerEq;
				// biome-ignore lint/suspicious/noExplicitAny: TradingView Lightweight Charts API requires any
				(chartsRef as any).current.observerDd = observerDd;
			} catch {
				/* lightweight-charts not available in SSR/test */
			}
		})();

		return () => {
			disposed = true;
			// biome-ignore lint/suspicious/noExplicitAny: TradingView Lightweight Charts API requires any
			const ref = chartsRef.current as any;
			if (ref) {
				ref.observerEq?.disconnect();
				ref.observerDd?.disconnect();
				ref.equityChart?.remove();
				ref.drawdownChart?.remove();
				chartsRef.current = null;
			}
		};
	}, [series, equityHeight, drawdownHeight]);

	if (series.length === 0) {
		return (
			<div data-testid="backtest-comparison-chart" className={className} style={{ width: "100%" }}>
				<div
					data-testid="comparison-empty"
					style={{
						padding: 48,
						textAlign: "center",
						color: "var(--text-muted)",
						fontSize: 14,
					}}
				>
					{t("comparison.noData")}
				</div>
			</div>
		);
	}

	return (
		<div
			data-testid="backtest-comparison-chart"
			className={className}
			style={{ display: "flex", flexDirection: "column", gap: 0, width: "100%" }}
		>
			{/* Section header + legend */}
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					marginBottom: 8,
					flexWrap: "wrap",
					gap: 8,
				}}
			>
				<span
					style={{
						fontSize: 13,
						fontWeight: 600,
						color: "var(--text-primary)",
					}}
				>
					{t("comparison.equityCurve")}
				</span>
				<div style={{ display: "flex", alignItems: "center", gap: 12 }}>
					{series.map((s, i) => (
						<div
							key={s.version}
							data-testid={`legend-item-${s.label}`}
							style={{ display: "flex", alignItems: "center", gap: 4 }}
						>
							<span
								style={{
									display: "inline-block",
									width: 12,
									height: 3,
									borderRadius: 2,
									backgroundColor: getVersionColor(i),
								}}
							/>
							<span
								style={{
									fontSize: 12,
									color: "var(--text-secondary, #9ca3af)",
									fontFamily: "var(--font-mono)",
								}}
							>
								{s.label}
							</span>
						</div>
					))}
				</div>
			</div>

			{/* Equity overlay panel */}
			<div
				ref={equityContainerRef}
				data-testid="equity-panel"
				style={{ height: `${equityHeight}px`, width: "100%" }}
			/>

			{/* Drawdown label */}
			<div
				style={{
					fontSize: 12,
					fontWeight: 500,
					color: "var(--text-muted)",
					marginTop: 8,
					marginBottom: 4,
					textTransform: "uppercase",
					letterSpacing: "0.05em",
				}}
			>
				{t("comparison.drawdown")}
			</div>

			{/* Drawdown comparison panel */}
			<div
				ref={drawdownContainerRef}
				data-testid="drawdown-panel"
				style={{ height: `${drawdownHeight}px`, width: "100%" }}
			/>
		</div>
	);
}
