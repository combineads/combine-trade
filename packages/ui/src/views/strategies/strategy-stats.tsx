export interface StrategyStatsData {
	winrate: number;
	expectancy: number;
	sampleCount: number;
	totalEvents: number;
	avgHoldBars: number;
}

export interface StrategyStatsProps {
	stats: StrategyStatsData;
}

function StatItem({ label, value, color }: { label: string; value: string; color?: string }) {
	return (
		<div style={{ textAlign: "center" }}>
			<div
				style={{
					fontSize: 11,
					color: "var(--text-muted)",
					marginBottom: 2,
					textTransform: "uppercase",
					letterSpacing: "0.05em",
				}}
			>
				{label}
			</div>
			<div
				style={{
					fontSize: 16,
					fontWeight: 600,
					fontFamily: "var(--font-mono)",
					color: color ?? "var(--text-primary)",
				}}
			>
				{value}
			</div>
		</div>
	);
}

export function StrategyStats({ stats }: StrategyStatsProps) {
	const winrateColor = stats.winrate > 0.5 ? "var(--color-win)" : "var(--text-secondary)";

	return (
		<div
			style={{
				display: "flex",
				justifyContent: "space-around",
				padding: "12px 8px",
				backgroundColor: "var(--bg-elevated)",
				borderRadius: "var(--radius-md)",
			}}
		>
			<StatItem
				label="Winrate"
				value={`${(stats.winrate * 100).toFixed(1)}%`}
				color={winrateColor}
			/>
			<StatItem label="Expectancy" value={stats.expectancy.toFixed(2)} />
			<StatItem label="Samples" value={stats.sampleCount.toLocaleString()} />
			<StatItem label="Events" value={stats.totalEvents.toLocaleString()} />
			<StatItem label="Avg Hold" value={`${stats.avgHoldBars} bars`} />
		</div>
	);
}
