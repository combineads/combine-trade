import { useTranslations } from "../../i18n/use-translations";
import type { JournalComparisonProps } from "./types";

export function JournalComparison({
	backtestPnl,
	livePnl,
	backtestWinRate,
	liveWinRate,
	locale = "ko",
}: JournalComparisonProps) {
	const t = useTranslations("journal", locale);

	return (
		<section style={{ marginBottom: 24 }}>
			<h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>
				{t("comparison.backtestVsLive")}
			</h2>
			<div
				style={{
					display: "grid",
					gridTemplateColumns: "1fr 1fr",
					gap: 16,
				}}
			>
				<CompareCard
					title={t("comparison.backtest")}
					pnlLabel={t("comparison.backtestPnl")}
					pnl={backtestPnl}
					winRateLabel={t("comparison.backtestWinRate")}
					winRate={backtestWinRate}
				/>
				<CompareCard
					title={t("comparison.live")}
					pnlLabel={t("comparison.livePnl")}
					pnl={livePnl}
					winRateLabel={t("comparison.liveWinRate")}
					winRate={liveWinRate}
				/>
			</div>
		</section>
	);
}

function CompareCard({
	title,
	pnlLabel,
	pnl,
	winRateLabel,
	winRate,
}: {
	title: string;
	pnlLabel: string;
	pnl: number;
	winRateLabel: string;
	winRate: number;
}) {
	return (
		<div
			style={{
				padding: "16px 20px",
				background: "var(--surface-1, #1f2937)",
				borderRadius: 8,
			}}
		>
			<h3
				style={{
					fontSize: 14,
					fontWeight: 600,
					color: "var(--text-secondary)",
					marginBottom: 12,
				}}
			>
				{title}
			</h3>
			<div style={{ marginBottom: 8 }}>
				<div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 2 }}>
					{pnlLabel}
				</div>
				<div
					style={{
						fontSize: 20,
						fontWeight: 700,
						fontFamily: "monospace",
						color:
							pnl >= 0 ? "var(--color-success, #10b981)" : "var(--color-danger, #ef4444)",
					}}
				>
					{pnl >= 0 ? "+" : ""}
					{pnl.toFixed(2)}
				</div>
			</div>
			<div>
				<div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 2 }}>
					{winRateLabel}
				</div>
				<div style={{ fontSize: 16, fontWeight: 600, fontFamily: "monospace" }}>
					{(winRate * 100).toFixed(1)}%
				</div>
			</div>
		</div>
	);
}
