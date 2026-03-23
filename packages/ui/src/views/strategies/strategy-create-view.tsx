export type StrategyDirection = "LONG" | "SHORT" | "BOTH";

const TIMEFRAMES = ["1m", "3m", "5m", "15m", "1h", "4h", "1d"] as const;

export interface StrategyCreateInput {
	name: string;
	direction: StrategyDirection;
	symbols: string[];
	timeframes: string[];
}

export interface StrategyCreateViewProps {
	onSubmit?: (data: StrategyCreateInput) => void;
	onCancel?: () => void;
	isSubmitting?: boolean;
}

function FieldLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
	return (
		<label
			htmlFor={htmlFor}
			style={{
				fontSize: 11,
				color: "var(--text-muted)",
				textTransform: "uppercase",
				letterSpacing: "0.05em",
				marginBottom: 4,
				display: "block",
			}}
		>
			{children}
		</label>
	);
}

export function StrategyCreateView({ onSubmit, onCancel, isSubmitting }: StrategyCreateViewProps) {
	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 600 }}>
			<h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
				New Strategy
			</h1>

			<form
				onSubmit={(e) => {
					e.preventDefault();
					if (onSubmit) {
						const fd = new FormData(e.currentTarget);
						onSubmit({
							name: fd.get("name") as string,
							direction: (fd.get("direction") as StrategyDirection) || "LONG",
							symbols: (fd.get("symbols") as string)
								.split(",")
								.map((s) => s.trim())
								.filter(Boolean),
							timeframes: TIMEFRAMES.filter((tf) => fd.get(`tf-${tf}`)),
						});
					}
				}}
				style={{ display: "flex", flexDirection: "column", gap: 20 }}
			>
				{/* Name */}
				<div>
					<FieldLabel>Strategy name</FieldLabel>
					<input
						name="name"
						type="text"
						placeholder="Strategy name"
						style={{
							width: "100%",
							padding: "8px 12px",
							fontSize: 13,
							fontFamily: "var(--font-mono)",
							backgroundColor: "var(--bg-elevated)",
							color: "var(--text-primary)",
							border: "1px solid var(--border-subtle)",
							borderRadius: "var(--radius-md)",
							boxSizing: "border-box",
						}}
					/>
				</div>

				{/* Direction */}
				<div>
					<FieldLabel>Direction</FieldLabel>
					<div style={{ display: "flex", gap: 8 }}>
						{(["LONG", "SHORT", "BOTH"] as const).map((dir) => (
							<label
								key={dir}
								style={{
									padding: "8px 16px",
									fontSize: 13,
									fontWeight: 600,
									borderRadius: "var(--radius-md)",
									border: "1px solid var(--border-subtle)",
									backgroundColor: "var(--bg-elevated)",
									color: "var(--text-secondary)",
									cursor: "pointer",
								}}
							>
								<input type="radio" name="direction" value={dir} style={{ display: "none" }} />
								{dir}
							</label>
						))}
					</div>
				</div>

				{/* Symbols */}
				<div>
					<FieldLabel>Symbols</FieldLabel>
					<input
						name="symbols"
						type="text"
						placeholder="BTC/USDT, ETH/USDT"
						style={{
							width: "100%",
							padding: "8px 12px",
							fontSize: 13,
							fontFamily: "var(--font-mono)",
							backgroundColor: "var(--bg-elevated)",
							color: "var(--text-primary)",
							border: "1px solid var(--border-subtle)",
							borderRadius: "var(--radius-md)",
							boxSizing: "border-box",
						}}
					/>
				</div>

				{/* Timeframes */}
				<div>
					<FieldLabel>Timeframes</FieldLabel>
					<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
						{TIMEFRAMES.map((tf) => (
							<label
								key={tf}
								style={{
									display: "flex",
									alignItems: "center",
									gap: 4,
									fontSize: 13,
									fontFamily: "var(--font-mono)",
									color: "var(--text-secondary)",
									cursor: "pointer",
								}}
							>
								<input type="checkbox" name={`tf-${tf}`} value={tf} />
								{tf}
							</label>
						))}
					</div>
				</div>

				{/* Actions */}
				<div style={{ display: "flex", gap: 12 }}>
					<button
						type="submit"
						disabled={isSubmitting}
						style={{
							padding: "8px 24px",
							fontSize: 13,
							fontWeight: 600,
							backgroundColor: isSubmitting ? "var(--bg-elevated)" : "#22C55E",
							color: isSubmitting ? "var(--text-muted)" : "#000",
							border: "none",
							borderRadius: "var(--radius-md)",
							cursor: isSubmitting ? "not-allowed" : "pointer",
							opacity: isSubmitting ? 0.6 : 1,
						}}
					>
						Create Strategy
					</button>
					<button
						type="button"
						onClick={onCancel}
						style={{
							padding: "8px 24px",
							fontSize: 13,
							fontWeight: 400,
							backgroundColor: "transparent",
							color: "var(--text-secondary)",
							border: "1px solid var(--border-subtle)",
							borderRadius: "var(--radius-md)",
							cursor: "pointer",
						}}
					>
						Cancel
					</button>
				</div>
			</form>
		</div>
	);
}
