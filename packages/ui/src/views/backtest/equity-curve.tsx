import { useTranslations } from "../../i18n";

export interface EquityPoint {
	index: number;
	equity: number;
}

export interface EquityCurveProps {
	points: EquityPoint[];
}

export function EquityCurve({ points }: EquityCurveProps) {
	const t = useTranslations("backtest");

	if (points.length === 0) {
		return (
			<div
				style={{
					padding: 32,
					textAlign: "center",
					color: "var(--text-muted)",
					fontSize: 14,
				}}
			>
				{t("stats.noData")}
			</div>
		);
	}

	const maxEquity = Math.max(...points.map((p) => p.equity));
	const minEquity = Math.min(...points.map((p) => p.equity));
	const range = maxEquity - minEquity || 1;

	return (
		<div
			style={{
				backgroundColor: "var(--bg-elevated)",
				borderRadius: "var(--radius-md)",
				padding: 16,
			}}
		>
			<div
				style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: "var(--text-primary)" }}
			>
				{t("stats.equityCurve")}
			</div>
			<div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 120 }}>
				{points.map((p) => {
					const height = ((p.equity - minEquity) / range) * 100;
					return (
						<div
							key={p.index}
							title={p.equity.toLocaleString()}
							style={{
								flex: 1,
								height: `${Math.max(height, 4)}%`,
								backgroundColor: p.equity >= points[0].equity ? "#22C55E" : "#EF4444",
								borderRadius: "2px 2px 0 0",
								minWidth: 2,
							}}
						/>
					);
				})}
			</div>
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					marginTop: 8,
					fontSize: 11,
					fontFamily: "var(--font-mono)",
					color: "var(--text-muted)",
				}}
			>
				<span>{minEquity.toLocaleString()}</span>
				<span>{maxEquity.toLocaleString()}</span>
			</div>
		</div>
	);
}
