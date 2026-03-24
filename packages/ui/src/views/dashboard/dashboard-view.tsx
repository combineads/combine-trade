import { getTranslations } from "../../i18n";
import type { Locale } from "../../i18n/glossary";
import { KillSwitchCard } from "./kill-switch-card";
import { type RecentEventItem, RecentEvents } from "./recent-events";
import { StrategySummary, type StrategySummaryItem } from "./strategy-summary";
import { WorkerStatus, type WorkerStatusItem } from "./worker-status";

export interface DashboardViewProps {
	locale?: Locale;
	killSwitchActive: boolean;
	killSwitchReason?: string;
	onKillSwitchActivate?: () => void;
	onKillSwitchDeactivate?: () => void;
	strategies: StrategySummaryItem[];
	recentEvents: RecentEventItem[];
	workers: WorkerStatusItem[];
}

export function DashboardView({
	locale = "ko",
	killSwitchActive,
	killSwitchReason,
	onKillSwitchActivate,
	onKillSwitchDeactivate,
	strategies,
	recentEvents,
	workers,
}: DashboardViewProps) {
	const t = getTranslations("dashboard", locale);

	return (
		<div>
			<h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 24, color: "var(--text-primary)" }}>
				{t("title")}
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
						t={t}
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
					<h2
						style={{
							fontSize: 16,
							fontWeight: 600,
							color: "var(--text-primary)",
							marginBottom: 16,
						}}
					>
						{t("sections.workers")}
					</h2>
					<WorkerStatus workers={workers} t={t} />
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
					<h2
						style={{
							fontSize: 16,
							fontWeight: 600,
							color: "var(--text-primary)",
							marginBottom: 16,
						}}
					>
						{t("sections.strategies")}
					</h2>
					<StrategySummary strategies={strategies} t={t} />
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
					<h2
						style={{
							fontSize: 16,
							fontWeight: 600,
							color: "var(--text-primary)",
							marginBottom: 16,
						}}
					>
						{t("sections.recentEvents")}
					</h2>
					<RecentEvents events={recentEvents} t={t} />
				</div>
			</div>
		</div>
	);
}
