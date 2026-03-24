import { type Locale, useTranslations } from "../../i18n";
import { formatNumber, formatPercent } from "../../i18n/formatters";

export interface TradeStatsData {
	totalTrades: number;
	winrate: number;
	expectancy: number;
	profitFactor: number;
	maxDrawdown: number;
	sharpeRatio: number;
	avgHoldBars: number;
}

export interface TradeStatsProps {
	stats: TradeStatsData;
	/** Locale for number formatting. Defaults to "ko". */
	locale?: Locale;
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
	return (
		<div
			style={{
				padding: "12px 16px",
				backgroundColor: "var(--bg-elevated)",
				borderRadius: "var(--radius-md)",
			}}
		>
			<div
				style={{
					fontSize: 11,
					color: "var(--text-muted)",
					textTransform: "uppercase",
					letterSpacing: "0.05em",
					marginBottom: 4,
				}}
			>
				{label}
			</div>
			<div
				style={{
					fontSize: 18,
					fontWeight: 700,
					fontFamily: "var(--font-mono)",
					color: color ?? "var(--text-primary)",
				}}
			>
				{value}
			</div>
		</div>
	);
}

export function TradeStats({ stats, locale = "ko" }: TradeStatsProps) {
	const t = useTranslations("backtest", locale);

	return (
		<div
			style={{
				display: "grid",
				gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
				gap: 12,
			}}
		>
			<Stat
				label={t("stats.totalTrades")}
				value={formatNumber(stats.totalTrades, locale)}
			/>
			<Stat
				label={t("stats.winRate")}
				value={formatPercent(stats.winrate, locale)}
				color={stats.winrate > 0.5 ? "var(--color-win)" : "var(--text-secondary)"}
			/>
			<Stat
				label={t("stats.expectancy")}
				value={formatNumber(stats.expectancy, locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
				color={stats.expectancy > 0 ? "var(--color-win)" : "var(--color-secondary)"}
			/>
			<Stat
				label={t("stats.profitFactor")}
				value={formatNumber(stats.profitFactor, locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
			/>
			<Stat
				label={t("stats.maxDrawdown")}
				value={formatPercent(stats.maxDrawdown / 100, locale)}
				color="var(--color-secondary)"
			/>
			<Stat
				label={t("stats.sharpeRatio")}
				value={formatNumber(stats.sharpeRatio, locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
			/>
			<Stat
				label={t("stats.avgHold")}
				value={`${formatNumber(stats.avgHoldBars, locale)} ${t("stats.bars")}`}
			/>
		</div>
	);
}
