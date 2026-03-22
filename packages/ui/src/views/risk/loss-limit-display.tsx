export interface LossLimitData {
	dailyLimit: number;
	dailyUsed: number;
	currency: string;
}

export interface LossLimitDisplayProps {
	data: LossLimitData;
}

function getProgressColor(pct: number): string {
	if (pct >= 80) return "#EF4444";
	if (pct >= 50) return "#F59E0B";
	return "#22C55E";
}

export function LossLimitDisplay({ data }: LossLimitDisplayProps) {
	const pct = data.dailyLimit > 0 ? (data.dailyUsed / data.dailyLimit) * 100 : 0;
	const color = getProgressColor(pct);

	return (
		<div style={{
			backgroundColor: "var(--bg-card)",
			border: "1px solid var(--border-subtle)",
			borderRadius: "var(--radius-lg)",
			padding: 16,
		}}>
			<div style={{
				fontSize: 11,
				color: "var(--text-muted)",
				textTransform: "uppercase",
				fontWeight: 600,
				marginBottom: 12,
				letterSpacing: "0.05em",
			}}>
				Daily Loss Limit
			</div>

			<div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
				<span style={{ fontSize: 13, fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>
					{data.dailyUsed.toLocaleString()} {data.currency}
				</span>
				<span style={{ fontSize: 13, fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
					/ {data.dailyLimit.toLocaleString()} {data.currency}
				</span>
			</div>

			{/* Progress bar */}
			<div style={{
				width: "100%",
				height: 8,
				backgroundColor: "var(--bg-elevated)",
				borderRadius: 4,
				overflow: "hidden",
			}}>
				<div style={{
					width: `${Math.min(pct, 100)}%`,
					height: "100%",
					backgroundColor: color,
					borderRadius: 4,
					transition: "width 0.3s ease",
				}} />
			</div>

			<div style={{
				fontSize: 12,
				fontFamily: "var(--font-mono)",
				color,
				marginTop: 6,
				textAlign: "right",
			}}>
				{pct.toFixed(1)}%
			</div>
		</div>
	);
}
