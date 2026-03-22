import { StatusBadge, type BadgeStatus } from "../../components/badge";
import type { StrategyListItem } from "./strategy-list-view";

export interface StrategyCardProps {
	strategy: StrategyListItem;
	onClick?: () => void;
}

export function StrategyCard({ strategy, onClick }: StrategyCardProps) {
	return (
		<div
			onClick={onClick}
			style={{
				backgroundColor: "var(--bg-card)",
				border: "1px solid var(--border-subtle)",
				borderRadius: "var(--radius-lg)",
				padding: 16,
				cursor: onClick ? "pointer" : "default",
				borderLeft: strategy.status === "active" ? "3px solid #22C55E" : undefined,
			}}
		>
			<div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
				<div>
					<div style={{ fontWeight: 600, fontSize: 15, color: "var(--text-primary)", marginBottom: 4 }}>
						{strategy.name}
					</div>
					<div style={{ fontSize: 12, color: "var(--text-muted)" }}>
						v{strategy.version} · {strategy.direction}
					</div>
				</div>
				<StatusBadge status={strategy.status as BadgeStatus} />
			</div>

			<div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
				{strategy.symbols.map((sym) => (
					<span
						key={sym}
						style={{
							fontSize: 11,
							fontFamily: "var(--font-mono)",
							padding: "2px 6px",
							borderRadius: "var(--radius-sm)",
							backgroundColor: "var(--bg-elevated)",
							color: "var(--text-secondary)",
						}}
					>
						{sym}
					</span>
				))}
			</div>

			<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
				<div style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>
					<span style={{ color: strategy.winrate > 0.5 ? "var(--color-win)" : "var(--text-secondary)" }}>
						{(strategy.winrate * 100).toFixed(1)}%
					</span>
					<span style={{ color: "var(--text-muted)", marginLeft: 8 }}>
						{strategy.eventCount} events
					</span>
				</div>
				<span
					style={{
						fontSize: 11,
						padding: "2px 8px",
						borderRadius: 9999,
						backgroundColor: "var(--bg-elevated)",
						color: "var(--text-secondary)",
					}}
				>
					{strategy.mode}
				</span>
			</div>
		</div>
	);
}
