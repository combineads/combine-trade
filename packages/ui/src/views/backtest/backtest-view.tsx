export interface BacktestStrategy {
	id: string;
	name: string;
}

export interface BacktestViewProps {
	strategies: BacktestStrategy[];
	onRun?: (strategyId: string) => void;
}

export function BacktestView({ strategies, onRun }: BacktestViewProps) {
	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
				}}
			>
				<h1
					style={{
						fontSize: 20,
						fontWeight: 700,
						color: "var(--text-primary)",
						margin: 0,
					}}
				>
					Backtest
				</h1>
			</div>

			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 12,
				}}
			>
				<select
					style={{
						padding: "8px 12px",
						fontSize: 13,
						fontFamily: "var(--font-mono)",
						backgroundColor: "var(--bg-elevated)",
						color: "var(--text-primary)",
						border: "1px solid var(--border-subtle)",
						borderRadius: "var(--radius-md)",
						cursor: "pointer",
					}}
				>
					{strategies.length === 0 && <option>No strategies</option>}
					{strategies.map((s) => (
						<option key={s.id} value={s.id}>
							{s.name}
						</option>
					))}
				</select>

				<button
					type="button"
					onClick={() => {
						if (strategies.length > 0 && onRun) {
							onRun(strategies[0].id);
						}
					}}
					style={{
						padding: "8px 20px",
						fontSize: 13,
						fontWeight: 600,
						backgroundColor: "#22C55E",
						color: "#000",
						border: "none",
						borderRadius: "var(--radius-md)",
						cursor: "pointer",
					}}
				>
					Run Backtest
				</button>
			</div>
		</div>
	);
}
