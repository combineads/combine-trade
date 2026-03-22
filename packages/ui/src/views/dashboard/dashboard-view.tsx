import { KillSwitchCard, type KillSwitchCardProps } from "./kill-switch-card";
import { StrategySummary, type StrategySummaryItem } from "./strategy-summary";
import { RecentEvents, type RecentEventItem } from "./recent-events";
import { WorkerStatus, type WorkerStatusItem } from "./worker-status";

export interface DashboardViewProps {
	killSwitchActive: boolean;
	killSwitchReason?: string;
	onKillSwitchActivate?: () => void;
	onKillSwitchDeactivate?: () => void;
	strategies: StrategySummaryItem[];
	recentEvents: RecentEventItem[];
	workers: WorkerStatusItem[];
}

export function DashboardView({
	killSwitchActive,
	killSwitchReason,
	onKillSwitchActivate,
	onKillSwitchDeactivate,
	strategies,
	recentEvents,
	workers,
}: DashboardViewProps) {
	return (
		<div>
			<h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 24, color: "var(--text-primary)" }}>
				Dashboard
			</h1>

			<div
				style={{
					display: "grid",
					gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
					gap: 24,
				}}
			>
				{/* Kill Switch — always first and prominent */}
				<div>
					<KillSwitchCard
						active={killSwitchActive}
						reason={killSwitchReason}
						onActivate={onKillSwitchActivate}
						onDeactivate={onKillSwitchDeactivate}
					/>
				</div>

				{/* Workers */}
				<div
					style={{
						backgroundColor: "var(--bg-card)",
						border: "1px solid var(--border-subtle)",
						borderRadius: "var(--radius-lg)",
						padding: 20,
					}}
				>
					<h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
						Workers
					</h2>
					<WorkerStatus workers={workers} />
				</div>

				{/* Strategies */}
				<div
					style={{
						backgroundColor: "var(--bg-card)",
						border: "1px solid var(--border-subtle)",
						borderRadius: "var(--radius-lg)",
						padding: 20,
					}}
				>
					<h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
						Strategies
					</h2>
					<StrategySummary strategies={strategies} />
				</div>

				{/* Recent Events */}
				<div
					style={{
						backgroundColor: "var(--bg-card)",
						border: "1px solid var(--border-subtle)",
						borderRadius: "var(--radius-lg)",
						padding: 20,
					}}
				>
					<h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
						Recent Events
					</h2>
					<RecentEvents events={recentEvents} />
				</div>
			</div>
		</div>
	);
}
