import { StatusBadge, type BadgeStatus } from "../../components/badge";

export interface StrategySummaryItem {
	id: string;
	name: string;
	status: BadgeStatus;
	winrate: number;
	eventCount: number;
}

export interface StrategySummaryProps {
	strategies: StrategySummaryItem[];
}

export function StrategySummary({ strategies }: StrategySummaryProps) {
	if (strategies.length === 0) {
		return (
			<div style={{ color: "var(--text-muted)", fontSize: 14, padding: 16 }}>
				No strategies yet
			</div>
		);
	}

	return (
		<div style={{ display: "grid", gap: 12 }}>
			{strategies.map((s) => (
				<div
					key={s.id}
					style={{
						backgroundColor: "var(--bg-card)",
						border: "1px solid var(--border-subtle)",
						borderRadius: "var(--radius-md)",
						padding: 12,
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
					}}
				>
					<div>
						<div style={{ fontWeight: 600, fontSize: 14, color: "var(--text-primary)" }}>
							{s.name}
						</div>
						<StatusBadge status={s.status} />
					</div>
					<div style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 13 }}>
						<div style={{ color: s.winrate > 0.5 ? "var(--color-win)" : "var(--text-secondary)" }}>
							{(s.winrate * 100).toFixed(1)}%
						</div>
						<div style={{ color: "var(--text-muted)", fontSize: 12 }}>
							{s.eventCount} events
						</div>
					</div>
				</div>
			))}
		</div>
	);
}
