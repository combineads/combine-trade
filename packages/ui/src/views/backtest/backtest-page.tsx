import { EquityCurve, type EquityPoint } from "./equity-curve";
import { type PnlBucket, PnlDistribution } from "./pnl-distribution";
import { TradeStats, type TradeStatsData } from "./trade-stats";

export interface BacktestResult {
	stats: TradeStatsData;
	equityCurve: EquityPoint[];
	pnlDistribution: PnlBucket[];
}

export interface BacktestPageProps {
	strategies: Array<{ id: string; name: string }>;
	onRun?: (params: { strategyId: string; startDate: string; endDate: string }) => void;
	isRunning?: boolean;
	result?: BacktestResult | null;
	error?: string | null;
}

export function BacktestPage({ strategies, onRun, isRunning, result, error }: BacktestPageProps) {
	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
			<h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
				Backtest
			</h1>

			{/* Form */}
			<div style={{ display: "flex", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
				<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
					<label
						htmlFor="backtest-strategy"
						style={{
							fontSize: 11,
							color: "var(--text-muted)",
							textTransform: "uppercase",
							letterSpacing: "0.05em",
						}}
					>
						Strategy
					</label>
					<select
						id="backtest-strategy"
						style={{
							padding: "8px 12px",
							fontSize: 13,
							fontFamily: "var(--font-mono)",
							backgroundColor: "var(--bg-elevated)",
							color: "var(--text-primary)",
							border: "1px solid var(--border-subtle)",
							borderRadius: "var(--radius-md)",
						}}
					>
						{strategies.length === 0 && <option>No strategies</option>}
						{strategies.map((s) => (
							<option key={s.id} value={s.id}>
								{s.name}
							</option>
						))}
					</select>
				</div>

				<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
					<label
						htmlFor="backtest-start-date"
						style={{
							fontSize: 11,
							color: "var(--text-muted)",
							textTransform: "uppercase",
							letterSpacing: "0.05em",
						}}
					>
						Start Date
					</label>
					<input
						id="backtest-start-date"
						type="date"
						style={{
							padding: "8px 12px",
							fontSize: 13,
							fontFamily: "var(--font-mono)",
							backgroundColor: "var(--bg-elevated)",
							color: "var(--text-primary)",
							border: "1px solid var(--border-subtle)",
							borderRadius: "var(--radius-md)",
						}}
					/>
				</div>

				<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
					<label
						htmlFor="backtest-end-date"
						style={{
							fontSize: 11,
							color: "var(--text-muted)",
							textTransform: "uppercase",
							letterSpacing: "0.05em",
						}}
					>
						End Date
					</label>
					<input
						id="backtest-end-date"
						type="date"
						style={{
							padding: "8px 12px",
							fontSize: 13,
							fontFamily: "var(--font-mono)",
							backgroundColor: "var(--bg-elevated)",
							color: "var(--text-primary)",
							border: "1px solid var(--border-subtle)",
							borderRadius: "var(--radius-md)",
						}}
					/>
				</div>

				<button
					type="button"
					disabled={isRunning}
					onClick={() => {
						if (strategies.length > 0 && onRun) {
							onRun({ strategyId: strategies[0].id, startDate: "", endDate: "" });
						}
					}}
					style={{
						padding: "8px 20px",
						fontSize: 13,
						fontWeight: 600,
						backgroundColor: isRunning ? "var(--bg-elevated)" : "#22C55E",
						color: isRunning ? "var(--text-muted)" : "#000",
						border: "none",
						borderRadius: "var(--radius-md)",
						cursor: isRunning ? "not-allowed" : "pointer",
						opacity: isRunning ? 0.6 : 1,
					}}
				>
					Run Backtest
				</button>
			</div>

			{/* Results */}
			<div>
				{error && (
					<div
						style={{
							padding: 16,
							backgroundColor: "rgba(239,68,68,0.1)",
							border: "1px solid rgba(239,68,68,0.3)",
							borderRadius: "var(--radius-md)",
							color: "#EF4444",
							fontSize: 13,
						}}
					>
						{error}
					</div>
				)}

				{!result && !isRunning && !error && (
					<div
						style={{
							padding: 48,
							textAlign: "center",
							color: "var(--text-muted)",
							fontSize: 14,
						}}
					>
						Run a backtest to see results
					</div>
				)}

				{isRunning && (
					<div
						style={{
							padding: 48,
							textAlign: "center",
							color: "var(--text-muted)",
							fontSize: 14,
						}}
					>
						Running backtest...
					</div>
				)}

				{result && !isRunning && (
					<div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
						<TradeStats stats={result.stats} />
						<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
							<EquityCurve points={result.equityCurve} />
							<PnlDistribution buckets={result.pnlDistribution} />
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
