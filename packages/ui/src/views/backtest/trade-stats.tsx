export interface TradeStatsData {
	totalTrades: number;
	winrate: number;
	expectancy: number;
	profitFactor: number;
	maxDrawdown: number;
	sharpeRatio: number;
	avgHoldBars: number;
}

export interface TradeStatsProps {
	stats: TradeStatsData;
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
	return (
		<div
			style={{
				padding: "12px 16px",
				backgroundColor: "var(--bg-elevated)",
				borderRadius: "var(--radius-md)",
			}}
		>
			<div
				style={{
					fontSize: 11,
					color: "var(--text-muted)",
					textTransform: "uppercase",
					letterSpacing: "0.05em",
					marginBottom: 4,
				}}
			>
				{label}
			</div>
			<div
				style={{
					fontSize: 18,
					fontWeight: 700,
					fontFamily: "var(--font-mono)",
					color: color ?? "var(--text-primary)",
				}}
			>
				{value}
			</div>
		</div>
	);
}

export function TradeStats({ stats }: TradeStatsProps) {
	return (
		<div
			style={{
				display: "grid",
				gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
				gap: 12,
			}}
		>
			<Stat label="Total Trades" value={stats.totalTrades.toLocaleString()} />
			<Stat
				label="Win Rate"
				value={`${(stats.winrate * 100).toFixed(1)}%`}
				color={stats.winrate > 0.5 ? "var(--color-win)" : "var(--text-secondary)"}
			/>
			<Stat
				label="Expectancy"
				value={stats.expectancy.toFixed(2)}
				color={stats.expectancy > 0 ? "var(--color-win)" : "var(--color-secondary)"}
			/>
			<Stat label="Profit Factor" value={stats.profitFactor.toFixed(2)} />
			<Stat
				label="Max Drawdown"
				value={`${stats.maxDrawdown.toFixed(1)}%`}
				color="var(--color-secondary)"
			/>
			<Stat label="Sharpe Ratio" value={stats.sharpeRatio.toFixed(2)} />
			<Stat label="Avg Hold" value={`${stats.avgHoldBars} bars`} />
		</div>
	);
}
