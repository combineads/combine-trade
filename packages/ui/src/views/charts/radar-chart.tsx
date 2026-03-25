"use client";

import type { Theme } from "../../theme/theme-provider";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RadarMetric {
	/** Unique key matching keys in RadarSeries.values */
	key: string;
	/** Human-readable axis label */
	label: string;
	/** Minimum possible value for normalization */
	min: number;
	/** Maximum possible value for normalization */
	max: number;
	/** When true, higher raw value = better performance (closer to outer edge) */
	higherIsBetter: boolean;
}

export interface RadarSeries {
	/** Unique identifier for the series */
	id: string;
	/** Display name shown in the legend */
	label: string;
	/** Map of metric key → raw value */
	values: Record<string, number>;
	/** Fill/stroke color (CSS color string) */
	color: string;
}

export interface RadarChartProps {
	metrics: RadarMetric[];
	series: RadarSeries[];
	/** Overall SVG size in px. Defaults to 360. */
	size?: number;
	className?: string;
	/** Controls color palette. Defaults to "dark". */
	theme?: Theme;
}

// ─── Pure math helpers ────────────────────────────────────────────────────────

/**
 * Normalize a raw value to [0, 1].
 * Handles inversion for metrics where lower is better (e.g. drawdown).
 */
export function normalizeValue(
	value: number,
	min: number,
	max: number,
	higherIsBetter: boolean,
): number {
	if (max === min) return 0.5;
	const ratio = (value - min) / (max - min);
	const clamped = Math.min(1, Math.max(0, ratio));
	return higherIsBetter ? clamped : 1 - clamped;
}

/**
 * Compute SVG polygon `points` attribute string from normalized [0,1] values.
 * First axis is placed at top (angle = -π/2), axes distributed evenly clockwise.
 */
export function computePolygonPoints(
	normalizedValues: number[],
	radius: number,
	cx: number,
	cy: number,
): string {
	const n = normalizedValues.length;
	if (n === 0) return "";
	return normalizedValues
		.map((v, i) => {
			const angle = (2 * Math.PI * i) / n - Math.PI / 2;
			const r = v * radius;
			const x = cx + r * Math.cos(angle);
			const y = cy + r * Math.sin(angle);
			return `${x.toFixed(2)},${y.toFixed(2)}`;
		})
		.join(" ");
}

// ─── Theme tokens ─────────────────────────────────────────────────────────────

interface ChartColors {
	gridStroke: string;
	axisStroke: string;
	labelFill: string;
	background: string;
}

function getChartColors(theme: Theme): ChartColors {
	if (theme === "light") {
		return {
			gridStroke: "#d1d5db",
			axisStroke: "#9ca3af",
			labelFill: "#374151",
			background: "transparent",
		};
	}
	return {
		gridStroke: "#2a2a3e",
		axisStroke: "#3f3f5a",
		labelFill: "#a0aec0",
		background: "transparent",
	};
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Concentric grid rings using stable level-number keys */
function GridRings({
	levels,
	radius,
	cx,
	cy,
	gridStroke,
}: { levels: number; radius: number; cx: number; cy: number; gridStroke: string }) {
	return (
		<>
			{Array.from({ length: levels }, (_, i) => {
				const level = i + 1;
				const r = (radius / levels) * level;
				return (
					<circle
						key={`grid-level-${level}`}
						cx={cx}
						cy={cy}
						r={r}
						fill="none"
						stroke={gridStroke}
						strokeWidth={1}
						strokeDasharray={level < levels ? "3 3" : undefined}
					/>
				);
			})}
		</>
	);
}

/** Axis lines from center to each metric vertex — keyed by metric.key */
function AxisLines({
	metrics,
	radius,
	cx,
	cy,
	axisStroke,
}: { metrics: RadarMetric[]; radius: number; cx: number; cy: number; axisStroke: string }) {
	const n = metrics.length;
	return (
		<>
			{metrics.map((metric, i) => {
				const angle = (2 * Math.PI * i) / n - Math.PI / 2;
				const x = cx + radius * Math.cos(angle);
				const y = cy + radius * Math.sin(angle);
				return (
					<line
						key={`axis-${metric.key}`}
						x1={cx}
						y1={cy}
						x2={x.toFixed(2)}
						y2={y.toFixed(2)}
						stroke={axisStroke}
						strokeWidth={1}
					/>
				);
			})}
		</>
	);
}

/** Axis label text elements — keyed by metric.key */
function AxisLabels({
	metrics,
	radius,
	cx,
	cy,
	labelFill,
	labelOffset,
}: {
	metrics: RadarMetric[];
	radius: number;
	cx: number;
	cy: number;
	labelFill: string;
	labelOffset: number;
}) {
	const n = metrics.length;
	return (
		<>
			{metrics.map((metric, i) => {
				const angle = (2 * Math.PI * i) / n - Math.PI / 2;
				const r = radius + labelOffset;
				const x = cx + r * Math.cos(angle);
				const y = cy + r * Math.sin(angle);

				// Horizontal alignment based on position
				let textAnchor: "start" | "middle" | "end" = "middle";
				if (Math.cos(angle) > 0.1) textAnchor = "start";
				else if (Math.cos(angle) < -0.1) textAnchor = "end";

				// Vertical alignment adjustment
				let dy = "0.35em";
				if (Math.sin(angle) < -0.5) dy = "0em";
				else if (Math.sin(angle) > 0.5) dy = "0.7em";

				return (
					<text
						key={`label-${metric.key}`}
						x={x.toFixed(2)}
						y={y.toFixed(2)}
						dy={dy}
						textAnchor={textAnchor}
						fill={labelFill}
						fontSize={11}
						fontFamily="var(--font-sans, sans-serif)"
					>
						{metric.label}
					</text>
				);
			})}
		</>
	);
}

/** Filled + stroked polygon for one series */
function SeriesPolygon({
	series,
	metrics,
	radius,
	cx,
	cy,
	opacity,
}: {
	series: RadarSeries;
	metrics: RadarMetric[];
	radius: number;
	cx: number;
	cy: number;
	opacity: number;
}) {
	const normalizedValues = metrics.map((m) => {
		const raw = series.values[m.key] ?? m.min;
		return normalizeValue(raw, m.min, m.max, m.higherIsBetter);
	});

	const points = computePolygonPoints(normalizedValues, radius, cx, cy);
	if (!points) return null;

	return (
		<polygon
			points={points}
			fill={series.color}
			fillOpacity={opacity}
			stroke={series.color}
			strokeWidth={2}
			strokeLinejoin="round"
		/>
	);
}

/** Single legend row — rect + label */
function LegendItem({ color, label }: { color: string; label: string }) {
	return (
		<g>
			<rect width={10} height={10} rx={2} fill={color} fillOpacity={0.7} />
			<text
				x={14}
				y={9}
				fontSize={11}
				fontFamily="var(--font-sans, sans-serif)"
				fill="currentColor"
			>
				{label}
			</text>
		</g>
	);
}

// ─── Main component ───────────────────────────────────────────────────────────

/** Number of concentric grid rings */
const GRID_LEVELS = 4;
/** Label padding beyond the outer ring in px */
const LABEL_OFFSET = 18;

export function RadarChart({
	metrics,
	series,
	size = 360,
	className,
	theme = "dark",
}: RadarChartProps) {
	const colors = getChartColors(theme);

	// Leave room for axis labels around the radar area
	const padding = LABEL_OFFSET + 30;
	const radarRadius = size / 2 - padding;
	const cx = size / 2;
	const cy = size / 2;

	// Legend: 20px per row
	const legendHeight = series.length > 0 ? series.length * 20 + 8 : 0;
	const totalHeight = size + legendHeight;

	const isEmpty = metrics.length === 0 || series.length === 0;

	return (
		<svg
			data-testid="radar-chart"
			viewBox={`0 0 ${size} ${totalHeight}`}
			width={size}
			height={totalHeight}
			className={className}
			role="img"
			aria-label="Strategy performance radar chart"
			style={{ display: "block" }}
		>
			<title>Strategy performance radar chart</title>

			<rect x={0} y={0} width={size} height={size} fill={colors.background} />

			{!isEmpty && (
				<>
					<GridRings
						levels={GRID_LEVELS}
						radius={radarRadius}
						cx={cx}
						cy={cy}
						gridStroke={colors.gridStroke}
					/>
					<AxisLines
						metrics={metrics}
						radius={radarRadius}
						cx={cx}
						cy={cy}
						axisStroke={colors.axisStroke}
					/>

					{/* Series polygons — render back-to-front so first series is on top */}
					{series.map((s) => (
						<SeriesPolygon
							key={s.id}
							series={s}
							metrics={metrics}
							radius={radarRadius}
							cx={cx}
							cy={cy}
							opacity={series.length > 1 ? 0.25 : 0.35}
						/>
					))}

					<AxisLabels
						metrics={metrics}
						radius={radarRadius}
						cx={cx}
						cy={cy}
						labelFill={colors.labelFill}
						labelOffset={LABEL_OFFSET}
					/>
				</>
			)}

			{legendHeight > 0 && (
				<g transform={`translate(${padding}, ${size + 8})`} style={{ color: colors.labelFill }}>
					{series.map((s, i) => (
						<g key={s.id} transform={`translate(0, ${i * 20})`}>
							<LegendItem color={s.color} label={s.label} />
						</g>
					))}
				</g>
			)}
		</svg>
	);
}
