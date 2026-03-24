import { useTranslations } from "../../i18n/use-translations";
import type { JournalStatsProps } from "./types";

export function JournalStats({ stats, locale = "ko" }: JournalStatsProps) {
	const t = useTranslations("journal", locale);

	return (
		<section style={{ marginBottom: 24 }}>
			<h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>{t("stats.title")}</h2>
			<div
				style={{
					display: "grid",
					gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
					gap: 12,
				}}
			>
				<StatCard label={t("stats.totalTrades")} value={String(stats.totalTrades)} />
				<StatCard
					label={t("stats.winRate")}
					value={`${(stats.winRate * 100).toFixed(1)}%`}
					positive={stats.winRate >= 0.5}
				/>
				<StatCard
					label={t("stats.avgPnl")}
					value={`${stats.avgPnl >= 0 ? "+" : ""}${stats.avgPnl.toFixed(2)}`}
					positive={stats.avgPnl >= 0}
				/>
				<StatCard
					label={t("stats.totalPnl")}
					value={`${stats.totalPnl >= 0 ? "+" : ""}${stats.totalPnl.toFixed(2)}`}
					positive={stats.totalPnl >= 0}
				/>
			</div>
		</section>
	);
}

function StatCard({
	label,
	value,
	positive,
}: { label: string; value: string; positive?: boolean }) {
	return (
		<div
			style={{
				padding: "12px 16px",
				background: "var(--surface-1, #1f2937)",
				borderRadius: 8,
			}}
		>
			<div
				style={{
					fontSize: 11,
					fontWeight: 600,
					color: "var(--text-secondary)",
					textTransform: "uppercase",
					letterSpacing: "0.05em",
					marginBottom: 4,
				}}
			>
				{label}
			</div>
			<div
				style={{
					fontSize: 20,
					fontWeight: 700,
					fontFamily: "monospace",
					color:
						positive === undefined
							? "var(--text-primary)"
							: positive
								? "var(--color-success, #10b981)"
								: "var(--color-danger, #ef4444)",
				}}
			>
				{value}
			</div>
		</div>
	);
}
