import { type BadgeStatus, StatusBadge } from "../../components/badge";
import { Button } from "../../components/button";
import { ConfigPanels, type StrategyConfig } from "./config-panels";
import { StrategyStats, type StrategyStatsData } from "./strategy-stats";

export interface StrategyDetail {
	id: string;
	name: string;
	code: string;
	version: number;
	direction: string;
	status: string;
	symbols: string[];
	timeframes: string[];
	config: StrategyConfig;
	mode: string;
}

export interface StrategyEditorViewProps {
	strategy: StrategyDetail;
	stats: StrategyStatsData;
	onSave?: (code: string) => void;
	onBack?: () => void;
}

export function StrategyEditorView({ strategy, stats, onSave, onBack }: StrategyEditorViewProps) {
	return (
		<div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
			{/* Header */}
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
					padding: "12px 0",
					borderBottom: "1px solid var(--border-subtle)",
					marginBottom: 12,
				}}
			>
				<div style={{ display: "flex", alignItems: "center", gap: 12 }}>
					{onBack && (
						<button
							type="button"
							onClick={onBack}
							style={{
								background: "none",
								border: "none",
								color: "var(--text-secondary)",
								cursor: "pointer",
								fontSize: 14,
								padding: "4px 8px",
							}}
						>
							Back
						</button>
					)}
					<h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
						{strategy.name}
					</h1>
					<span style={{ fontSize: 12, color: "var(--text-muted)" }}>v{strategy.version}</span>
					<StatusBadge status={strategy.status as BadgeStatus} />
				</div>
				<Button variant="primary" onClick={() => onSave?.(strategy.code)}>
					Save
				</Button>
			</div>

			{/* Stats bar */}
			<div style={{ marginBottom: 12 }}>
				<StrategyStats stats={stats} />
			</div>

			{/* Split pane: Editor (55%) + Config (45%) */}
			<div
				style={{
					display: "flex",
					flex: 1,
					gap: 1,
					minHeight: 0,
					border: "1px solid var(--border-subtle)",
					borderRadius: "var(--radius-md)",
					overflow: "hidden",
				}}
			>
				{/* Left: Code editor area */}
				<div
					style={{
						flex: "0 0 55%",
						display: "flex",
						flexDirection: "column",
						backgroundColor: "var(--bg-card)",
					}}
				>
					{/* Code content — SSR fallback (Monaco loads client-side) */}
					<div
						style={{
							flex: 1,
							overflow: "auto",
							padding: 16,
						}}
					>
						<pre
							style={{
								margin: 0,
								fontFamily: "var(--font-mono)",
								fontSize: 13,
								lineHeight: 1.5,
								color: "var(--text-primary)",
								whiteSpace: "pre-wrap",
							}}
						>
							{strategy.code}
						</pre>
					</div>

					{/* Status bar */}
					<div
						style={{
							display: "flex",
							gap: 16,
							padding: "4px 12px",
							fontSize: 11,
							color: "var(--text-muted)",
							borderTop: "1px solid var(--border-subtle)",
							backgroundColor: "var(--bg-elevated)",
						}}
					>
						<span>TypeScript</span>
						<span>UTF-8</span>
					</div>
				</div>

				{/* Divider */}
				<div
					style={{
						width: 1,
						backgroundColor: "var(--border-subtle)",
						cursor: "col-resize",
					}}
				/>

				{/* Right: Config panels */}
				<div
					style={{
						flex: "0 0 calc(45% - 1px)",
						padding: 12,
						overflow: "auto",
						backgroundColor: "var(--bg-card)",
					}}
				>
					<ConfigPanels
						name={strategy.name}
						direction={strategy.direction}
						symbols={strategy.symbols}
						timeframes={strategy.timeframes}
						config={strategy.config}
						mode={strategy.mode}
					/>
				</div>
			</div>
		</div>
	);
}
