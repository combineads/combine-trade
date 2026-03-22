"use client";

import { useEffect, useRef } from "react";

export interface ChartStrategyEvent {
	id: string;
	time: number;
	direction: "LONG" | "SHORT";
	exitTime?: number;
	exitReason?: "WIN" | "LOSS" | "TIME_EXIT";
	entryPrice: number;
	exitPrice?: number;
	tpPrice?: number;
	slPrice?: number;
}

export interface StrategyEventOverlayProps {
	seriesRef: React.RefObject<unknown | null>;
	events: ChartStrategyEvent[];
	selectedEventId?: string;
}

interface SeriesMarker {
	time: number;
	position: "belowBar" | "aboveBar" | "inBar";
	color: string;
	shape: "arrowUp" | "arrowDown" | "circle" | "square";
	text: string;
}

function getComputedColor(name: string, fallback: string): string {
	if (typeof globalThis.document === "undefined") return fallback;
	return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function buildMarkers(events: ChartStrategyEvent[]): SeriesMarker[] {
	const markers: SeriesMarker[] = [];
	const successColor = getComputedColor("--color-success", "#22c55e");
	const dangerColor = getComputedColor("--color-danger", "#ef4444");
	const neutralColor = getComputedColor("--color-text-secondary", "#9ca3af");

	for (const e of events) {
		// Entry marker
		markers.push({
			time: e.time,
			position: e.direction === "LONG" ? "belowBar" : "aboveBar",
			color: e.direction === "LONG" ? successColor : dangerColor,
			shape: e.direction === "LONG" ? "arrowUp" : "arrowDown",
			text: e.direction,
		});

		// Exit marker
		if (e.exitTime && e.exitReason) {
			const exitColor =
				e.exitReason === "WIN" ? successColor :
				e.exitReason === "LOSS" ? dangerColor :
				neutralColor;
			markers.push({
				time: e.exitTime,
				position: e.direction === "LONG" ? "aboveBar" : "belowBar",
				color: exitColor,
				shape: e.exitReason === "TIME_EXIT" ? "square" : "circle",
				text: e.exitReason,
			});
		}
	}

	return markers.sort((a, b) => a.time - b.time);
}

export function StrategyEventOverlay({
	seriesRef,
	events,
	selectedEventId,
}: StrategyEventOverlayProps): null {
	const priceLinesRef = useRef<unknown[]>([]);

	useEffect(() => {
		const series = seriesRef.current as any;
		if (!series || typeof series.setMarkers !== "function") return;

		const markers = buildMarkers(events);
		try {
			series.setMarkers(markers);
		} catch { /* series may not be ready */ }

		return () => {
			try {
				series.setMarkers([]);
			} catch { /* ignore */ }
		};
	}, [seriesRef, events]);

	useEffect(() => {
		const series = seriesRef.current as any;
		if (!series || typeof series.createPriceLine !== "function") return;

		// Clean up previous price lines
		for (const line of priceLinesRef.current) {
			try {
				series.removePriceLine(line);
			} catch { /* ignore */ }
		}
		priceLinesRef.current = [];

		if (!selectedEventId) return;

		const event = events.find((e) => e.id === selectedEventId);
		if (!event) return;

		const successColor = getComputedColor("--color-success", "#22c55e");
		const dangerColor = getComputedColor("--color-danger", "#ef4444");

		if (event.tpPrice != null) {
			try {
				const tpLine = series.createPriceLine({
					price: event.tpPrice,
					color: successColor,
					lineWidth: 1,
					lineStyle: 2, // dashed
					axisLabelVisible: true,
					title: "TP",
				});
				priceLinesRef.current.push(tpLine);
			} catch { /* ignore */ }
		}

		if (event.slPrice != null) {
			try {
				const slLine = series.createPriceLine({
					price: event.slPrice,
					color: dangerColor,
					lineWidth: 1,
					lineStyle: 2, // dashed
					axisLabelVisible: true,
					title: "SL",
				});
				priceLinesRef.current.push(slLine);
			} catch { /* ignore */ }
		}

		return () => {
			for (const line of priceLinesRef.current) {
				try {
					series.removePriceLine(line);
				} catch { /* ignore */ }
			}
			priceLinesRef.current = [];
		};
	}, [seriesRef, events, selectedEventId]);

	return null;
}
