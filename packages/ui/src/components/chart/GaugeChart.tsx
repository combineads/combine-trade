"use client";

import { useEffect, useRef, useState } from "react";

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_VALUE = 1500;
const ZONE_GREEN_END = 500;
const ZONE_YELLOW_END = 800;

const COLOR_GREEN = "#22C55E";
const COLOR_YELLOW = "#EAB308";
const COLOR_RED = "#EF4444";

// SVG geometry
const CX = 100;
const CY = 100;
const RADIUS = 75;
const STROKE_WIDTH = 16;

// ─── Types ────────────────────────────────────────────────────────────────────

export type GaugePercentile = "p50" | "p95" | "p99";
export type GaugeZone = "green" | "yellow" | "red";

export interface GaugeSector {
	startAngle: number;
	endAngle: number;
	color: string;
	zone: GaugeZone;
}

export interface GaugeChartProps {
	/** Latency value in milliseconds */
	value: number;
	/** Which percentile this gauge represents */
	percentile: GaugePercentile;
	/** Optional SSE endpoint for real-time updates (e.g. /api/metrics/latency) */
	sseUrl?: string;
	/** Optional CSS class */
	className?: string;
}

export interface LatencyMetrics {
	p50?: number;
	p95?: number;
	p99?: number;
}

// ─── Pure math utilities ───────────────────────────────────────────────────────

/**
 * Maps a latency value (ms) to a needle rotation angle in [0, 180] degrees.
 * 0ms → 0°, 1500ms → 180°. Values above 1500 are clamped.
 */
export function valueToAngle(value: number): number {
	const clamped = Math.max(0, Math.min(value, MAX_VALUE));
	return (clamped / MAX_VALUE) * 180;
}

/**
 * Returns the three color-coded gauge sectors:
 * - green: 0–500ms
 * - yellow: 500–800ms
 * - red: 800ms+
 */
export function gaugeSectors(): GaugeSector[] {
	return [
		{
			startAngle: valueToAngle(0),
			endAngle: valueToAngle(ZONE_GREEN_END),
			color: COLOR_GREEN,
			zone: "green",
		},
		{
			startAngle: valueToAngle(ZONE_GREEN_END),
			endAngle: valueToAngle(ZONE_YELLOW_END),
			color: COLOR_YELLOW,
			zone: "yellow",
		},
		{
			startAngle: valueToAngle(ZONE_YELLOW_END),
			endAngle: valueToAngle(MAX_VALUE),
			color: COLOR_RED,
			zone: "red",
		},
	];
}

/**
 * Returns which zone a given value falls into.
 */
export function valueToZone(value: number): GaugeZone {
	const clamped = Math.max(0, value);
	if (clamped < ZONE_GREEN_END) return "green";
	if (clamped < ZONE_YELLOW_END) return "yellow";
	return "red";
}

// ─── SVG arc helpers ───────────────────────────────────────────────────────────

/**
 * Converts polar coordinates to cartesian.
 * The gauge semicircle starts at the left (180° in standard math),
 * sweeping right through the top to the right (0° in standard math).
 */
function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
	// Map gauge angle [0,180] to SVG angle: gauge 0 = left = 180deg standard
	const svgAngle = 180 - angleDeg;
	const rad = (svgAngle * Math.PI) / 180;
	return {
		x: cx + r * Math.cos(rad),
		y: cy - r * Math.sin(rad),
	};
}

/**
 * Generates an SVG arc path string for a gauge sector.
 */
function arcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
	const start = polarToCartesian(cx, cy, r, startAngle);
	const end = polarToCartesian(cx, cy, r, endAngle);
	const largeArc = endAngle - startAngle > 180 ? 1 : 0;
	return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

/**
 * Computes needle line endpoint from the gauge center.
 */
function needleEndpoint(angle: number): { x: number; y: number } {
	return polarToCartesian(CX, CY, RADIUS - STROKE_WIDTH / 2 - 4, angle);
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function GaugeChart({ value, percentile, sseUrl, className }: GaugeChartProps) {
	const [displayValue, setDisplayValue] = useState(value);
	const esRef = useRef<EventSource | null>(null);

	// SSE subscription for real-time updates
	useEffect(() => {
		if (!sseUrl) return;
		if (typeof globalThis.EventSource === "undefined") return;

		const es = new EventSource(sseUrl, { withCredentials: true });
		esRef.current = es;

		es.onmessage = (e: MessageEvent) => {
			try {
				const metrics = JSON.parse(e.data as string) as LatencyMetrics;
				const val = metrics[percentile];
				if (typeof val === "number") {
					setDisplayValue(val);
				}
			} catch {
				// ignore parse errors
			}
		};

		es.addEventListener("latency", (e: Event) => {
			try {
				const metrics = JSON.parse((e as MessageEvent).data as string) as LatencyMetrics;
				const val = metrics[percentile];
				if (typeof val === "number") {
					setDisplayValue(val);
				}
			} catch {
				// ignore parse errors
			}
		});

		return () => {
			es.close();
			esRef.current = null;
		};
	}, [sseUrl, percentile]);

	// Keep displayValue in sync with prop when not using SSE
	useEffect(() => {
		if (!sseUrl) {
			setDisplayValue(value);
		}
	}, [value, sseUrl]);

	const angle = valueToAngle(displayValue);
	const zone = valueToZone(displayValue);
	const sectors = gaugeSectors();
	const needle = needleEndpoint(angle);
	const zoneColor = zone === "green" ? COLOR_GREEN : zone === "yellow" ? COLOR_YELLOW : COLOR_RED;

	return (
		<div
			data-testid="gauge-chart"
			data-zone={zone}
			className={className}
			style={{
				display: "inline-flex",
				flexDirection: "column",
				alignItems: "center",
				gap: 4,
			}}
		>
			<svg
				viewBox="0 0 200 120"
				width={200}
				height={120}
				aria-label={`${percentile} latency: ${displayValue}ms`}
				role="img"
			>
				{/* Arc segments */}
				{sectors.map((sector) => (
					<path
						key={sector.zone}
						d={arcPath(CX, CY, RADIUS, sector.startAngle, sector.endAngle)}
						stroke={sector.color}
						strokeWidth={STROKE_WIDTH}
						fill="none"
						strokeLinecap="butt"
					/>
				))}

				{/* Needle */}
				<line
					x1={CX}
					y1={CY}
					x2={needle.x}
					y2={needle.y}
					stroke={zoneColor}
					strokeWidth={2.5}
					strokeLinecap="round"
				/>

				{/* Center pivot */}
				<circle cx={CX} cy={CY} r={4} fill={zoneColor} />

				{/* Value label */}
				<text
					x={CX}
					y={CY + 20}
					textAnchor="middle"
					fontSize={14}
					fontWeight={700}
					fill={zoneColor}
				>
					{displayValue}
					<tspan fontSize={10} fontWeight={400} fill="#94a3b8">
						ms
					</tspan>
				</text>

				{/* Percentile label */}
				<text x={CX} y={CY + 34} textAnchor="middle" fontSize={10} fill="#64748B">
					{percentile}
				</text>

				{/* Zone boundary tick at 500ms */}
				{(() => {
					const tick = polarToCartesian(CX, CY, RADIUS + STROKE_WIDTH / 2 + 2, valueToAngle(500));
					const tickIn = polarToCartesian(CX, CY, RADIUS - STROKE_WIDTH / 2 - 2, valueToAngle(500));
					return (
						<line
							x1={tick.x}
							y1={tick.y}
							x2={tickIn.x}
							y2={tickIn.y}
							stroke="#1e293b"
							strokeWidth={1.5}
						/>
					);
				})()}

				{/* Zone boundary tick at 800ms */}
				{(() => {
					const tick = polarToCartesian(CX, CY, RADIUS + STROKE_WIDTH / 2 + 2, valueToAngle(800));
					const tickIn = polarToCartesian(CX, CY, RADIUS - STROKE_WIDTH / 2 - 2, valueToAngle(800));
					return (
						<line
							x1={tick.x}
							y1={tick.y}
							x2={tickIn.x}
							y2={tickIn.y}
							stroke="#1e293b"
							strokeWidth={1.5}
						/>
					);
				})()}

				{/* Min label */}
				<text x={25} y={110} textAnchor="middle" fontSize={9} fill="#64748B">
					0
				</text>

				{/* Max label */}
				<text x={175} y={110} textAnchor="middle" fontSize={9} fill="#64748B">
					1500
				</text>
			</svg>
		</div>
	);
}
