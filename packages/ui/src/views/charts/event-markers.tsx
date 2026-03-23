export type MarkerType = "LONG" | "SHORT" | "WIN" | "LOSS" | "TIME_EXIT";

export interface EventMarkerProps {
	type: MarkerType;
}

const MARKER_CONFIG: Record<MarkerType, { symbol: string; color: string }> = {
	LONG: { symbol: "\u2191", color: "#22C55E" }, // ↑
	SHORT: { symbol: "\u2193", color: "#EF4444" }, // ↓
	WIN: { symbol: "\u2713", color: "#22C55E" }, // ✓
	LOSS: { symbol: "\u2717", color: "#EF4444" }, // ✗
	TIME_EXIT: { symbol: "\u23F1", color: "#64748B" }, // ⏱
};

export function EventMarker({ type }: EventMarkerProps) {
	const config = MARKER_CONFIG[type];
	return (
		<span
			style={{
				display: "inline-flex",
				alignItems: "center",
				justifyContent: "center",
				width: 20,
				height: 20,
				borderRadius: "50%",
				backgroundColor: `${config.color}20`,
				color: config.color,
				fontSize: 12,
				fontWeight: 700,
			}}
			title={type}
		>
			{config.symbol}
		</span>
	);
}

export interface TpSlOverlayProps {
	entryPrice: number;
	takeProfit: number;
	stopLoss: number;
}

export function TpSlOverlay({ entryPrice, takeProfit, stopLoss }: TpSlOverlayProps) {
	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				gap: 4,
				fontSize: 12,
				fontFamily: "var(--font-mono)",
			}}
		>
			<div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
				<span style={{ color: "var(--text-muted)" }}>TP</span>
				<span style={{ color: "#22C55E" }}>{takeProfit.toLocaleString()}</span>
			</div>
			<div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
				<span style={{ color: "var(--text-muted)" }}>Entry</span>
				<span style={{ color: "var(--text-primary)" }}>{entryPrice.toLocaleString()}</span>
			</div>
			<div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
				<span style={{ color: "var(--text-muted)" }}>SL</span>
				<span style={{ color: "#EF4444" }}>{stopLoss.toLocaleString()}</span>
			</div>
		</div>
	);
}
