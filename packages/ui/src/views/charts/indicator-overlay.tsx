"use client";

import { useEffect, useRef } from "react";

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

export interface LinePoint {
	time: number;
	value: number;
}

export interface BollingerPoint {
	time: number;
	upper: number;
	mid: number;
	lower: number;
}

// ---------------------------------------------------------------------------
// Indicator config discriminated union
// ---------------------------------------------------------------------------

export interface SmaIndicatorConfig {
	type: "sma";
	period: number;
	color: string;
	visible?: boolean;
	data: LinePoint[];
}

export interface EmaIndicatorConfig {
	type: "ema";
	period: number;
	color: string;
	visible?: boolean;
	data: LinePoint[];
}

export interface BollingerIndicatorConfig {
	type: "bb";
	period: number;
	stdDev?: number;
	lineColor: string;
	fillColor: string;
	visible?: boolean;
	data: BollingerPoint[];
}

export type IndicatorConfig = SmaIndicatorConfig | EmaIndicatorConfig | BollingerIndicatorConfig;

// ---------------------------------------------------------------------------
// Chart API helpers (testable pure functions)
// ---------------------------------------------------------------------------

/** Opaque handle returned by applyIndicatorToChart — used to remove series later. */
export type IndicatorHandle =
	| { kind: "line"; series: unknown }
	| { kind: "bb"; areaSeries: unknown; midSeries: unknown };

/**
 * Apply a single indicator config to a chart instance.
 * Returns an IndicatorHandle used by removeIndicatorFromChart.
 *
 * Exported for unit testing without a React render.
 */
export function applyIndicatorToChart(
	// biome-ignore lint/suspicious/noExplicitAny: TradingView Lightweight Charts API requires any
	chart: any,
	config: IndicatorConfig,
): IndicatorHandle {
	const visible = config.visible !== false;

	if (config.type === "sma" || config.type === "ema") {
		const series = chart.addLineSeries({
			color: config.color,
			lineWidth: 2,
			visible,
			priceLineVisible: false,
			lastValueVisible: false,
		});
		// biome-ignore lint/suspicious/noExplicitAny: TradingView Lightweight Charts API requires any
		series.setData(config.data as any);
		if (!visible) {
			series.applyOptions({ visible: false });
		}
		return { kind: "line", series };
	}

	// Bollinger Bands: area series for upper/lower fill + line series for midline
	const areaSeries = chart.addAreaSeries({
		topColor: config.fillColor,
		bottomColor: config.fillColor,
		lineColor: config.lineColor,
		lineWidth: 1,
		visible,
		priceLineVisible: false,
		lastValueVisible: false,
	});

	// Map BB data to upper/lower area series format (topValue/bottomValue)
	const areaData = config.data.map((d) => ({
		time: d.time,
		value: d.upper,
		// We store lower as custom field; lightweight-charts area uses value for top
		// We use two line series approach: upper as area top, lower as area bottom
	}));
	// biome-ignore lint/suspicious/noExplicitAny: TradingView Lightweight Charts API requires any
	areaSeries.setData(areaData as any);
	if (!visible) {
		areaSeries.applyOptions({ visible: false });
	}

	const midSeries = chart.addLineSeries({
		color: config.lineColor,
		lineWidth: 1,
		lineStyle: 1, // dashed
		visible,
		priceLineVisible: false,
		lastValueVisible: false,
	});
	// biome-ignore lint/suspicious/noExplicitAny: TradingView Lightweight Charts API requires any
	midSeries.setData(config.data.map((d) => ({ time: d.time, value: d.mid })) as any);
	if (!visible) {
		midSeries.applyOptions({ visible: false });
	}

	return { kind: "bb", areaSeries, midSeries };
}

/**
 * Remove all series associated with an indicator handle from the chart.
 *
 * Exported for unit testing without a React render.
 */
export function removeIndicatorFromChart(
	// biome-ignore lint/suspicious/noExplicitAny: TradingView Lightweight Charts API requires any
	chart: any,
	handle: IndicatorHandle,
): void {
	try {
		if (handle.kind === "line") {
			chart.removeSeries(handle.series);
		} else {
			chart.removeSeries(handle.areaSeries);
			chart.removeSeries(handle.midSeries);
		}
	} catch {
		/* chart may already be destroyed */
	}
}

/**
 * Update the visibility of all series in a handle without removing them.
 */
export function setIndicatorVisible(handle: IndicatorHandle, visible: boolean): void {
	try {
		if (handle.kind === "line") {
			// biome-ignore lint/suspicious/noExplicitAny: TradingView Lightweight Charts API requires any
			(handle.series as any).applyOptions({ visible });
		} else {
			// biome-ignore lint/suspicious/noExplicitAny: TradingView Lightweight Charts API requires any
			(handle.areaSeries as any).applyOptions({ visible });
			// biome-ignore lint/suspicious/noExplicitAny: TradingView Lightweight Charts API requires any
			(handle.midSeries as any).applyOptions({ visible });
		}
	} catch {
		/* series may not be ready */
	}
}

// ---------------------------------------------------------------------------
// useIndicatorSeries hook — shared series lifecycle logic
// ---------------------------------------------------------------------------

interface UseIndicatorSeriesOptions {
	chartRef: React.RefObject<unknown | null>;
	config: IndicatorConfig;
}

function useIndicatorSeries({ chartRef, config }: UseIndicatorSeriesOptions): void {
	const handleRef = useRef<IndicatorHandle | null>(null);

	// Mount / data change: (re)apply series to chart.
	// biome-ignore lint/correctness/useExhaustiveDependencies: chartRef is a stable ref object; config object identity changes on every render so we track granular fields instead
	useEffect(() => {
		// biome-ignore lint/suspicious/noExplicitAny: TradingView Lightweight Charts API requires any
		const chart = chartRef.current as any;
		if (!chart || typeof chart.addLineSeries !== "function") return;

		// Remove previous handle before re-applying
		if (handleRef.current) {
			removeIndicatorFromChart(chart, handleRef.current);
			handleRef.current = null;
		}

		try {
			handleRef.current = applyIndicatorToChart(chart, config);
		} catch {
			/* chart may not be ready */
		}

		return () => {
			// biome-ignore lint/suspicious/noExplicitAny: TradingView Lightweight Charts API requires any
			const c = chartRef.current as any;
			if (c && handleRef.current) {
				removeIndicatorFromChart(c, handleRef.current);
				handleRef.current = null;
			}
		};
	}, [config.type, config.period, config.data]);

	// Visibility-only change: apply without re-adding series
	useEffect(() => {
		if (!handleRef.current) return;
		setIndicatorVisible(handleRef.current, config.visible !== false);
	}, [config.visible]);
}

// ---------------------------------------------------------------------------
// SmaOverlay
// ---------------------------------------------------------------------------

export interface SmaOverlayProps {
	chartRef: React.RefObject<unknown | null>;
	period: number;
	color: string;
	data: LinePoint[];
	visible?: boolean;
}

export function SmaOverlay({
	chartRef,
	period,
	color,
	data,
	visible = true,
}: SmaOverlayProps): null {
	useIndicatorSeries({
		chartRef,
		config: { type: "sma", period, color, data, visible },
	});
	return null;
}

// ---------------------------------------------------------------------------
// EmaOverlay
// ---------------------------------------------------------------------------

export interface EmaOverlayProps {
	chartRef: React.RefObject<unknown | null>;
	period: number;
	color: string;
	data: LinePoint[];
	visible?: boolean;
}

export function EmaOverlay({
	chartRef,
	period,
	color,
	data,
	visible = true,
}: EmaOverlayProps): null {
	useIndicatorSeries({
		chartRef,
		config: { type: "ema", period, color, data, visible },
	});
	return null;
}

// ---------------------------------------------------------------------------
// BollingerBandsOverlay
// ---------------------------------------------------------------------------

export interface BollingerBandsOverlayProps {
	chartRef: React.RefObject<unknown | null>;
	period: number;
	stdDev?: number;
	lineColor: string;
	fillColor: string;
	data: BollingerPoint[];
	visible?: boolean;
}

export function BollingerBandsOverlay({
	chartRef,
	period,
	stdDev = 2,
	lineColor,
	fillColor,
	data,
	visible = true,
}: BollingerBandsOverlayProps): null {
	useIndicatorSeries({
		chartRef,
		config: { type: "bb", period, stdDev, lineColor, fillColor, data, visible },
	});
	return null;
}

// ---------------------------------------------------------------------------
// IndicatorOverlay — parent component that renders a list of indicator configs
// ---------------------------------------------------------------------------

export type IndicatorOverlayItem =
	| (SmaIndicatorConfig & { type: "sma" })
	| (EmaIndicatorConfig & { type: "ema" })
	| (BollingerIndicatorConfig & { type: "bb" });

export interface IndicatorOverlayProps {
	chartRef: React.RefObject<unknown | null>;
	indicators: IndicatorOverlayItem[];
}

export function IndicatorOverlay({ chartRef, indicators }: IndicatorOverlayProps): null {
	// Each indicator is rendered via its dedicated overlay.
	// We use a single flat useEffect loop so we can handle dynamic lists.
	const handlesRef = useRef<IndicatorHandle[]>([]);

	useEffect(() => {
		// biome-ignore lint/suspicious/noExplicitAny: TradingView Lightweight Charts API requires any
		const chart = chartRef.current as any;
		if (!chart || typeof chart.addLineSeries !== "function") return;

		// Remove all previous handles
		for (const handle of handlesRef.current) {
			removeIndicatorFromChart(chart, handle);
		}
		handlesRef.current = [];

		// Apply each indicator
		try {
			for (const config of indicators) {
				const handle = applyIndicatorToChart(chart, config);
				handlesRef.current.push(handle);
			}
		} catch {
			/* chart may not be ready */
		}

		return () => {
			// biome-ignore lint/suspicious/noExplicitAny: TradingView Lightweight Charts API requires any
			const c = chartRef.current as any;
			if (c) {
				for (const handle of handlesRef.current) {
					removeIndicatorFromChart(c, handle);
				}
			}
			handlesRef.current = [];
		};
	}, [chartRef, indicators]);

	return null;
}
