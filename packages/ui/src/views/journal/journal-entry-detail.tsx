import { useTranslations } from "../../i18n/use-translations";
import type { JournalEntryDetailProps } from "./types";

export function JournalEntryDetail({ entry, locale = "ko" }: JournalEntryDetailProps) {
	const t = useTranslations("journal", locale);

	return (
		<div style={{ padding: 24 }}>
			<h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>
				{t("entry.tradeSummary")}
			</h2>

			<div
				style={{
					display: "grid",
					gridTemplateColumns: "1fr 1fr",
					gap: 16,
					marginBottom: 24,
				}}
			>
				<Field label={t("entry.tradeDate")} value={entry.tradeDate} />
				<Field label={t("entry.symbol")} value={entry.symbol} mono />
				<Field label={t("entry.side")} value={entry.side} />
				<Field label={t("entry.entryPrice")} value={entry.entryPrice.toFixed(2)} mono />
				<Field label={t("entry.exitPrice")} value={entry.exitPrice.toFixed(2)} mono />
				<Field
					label={t("entry.pnl")}
					value={`${entry.pnl >= 0 ? "+" : ""}${entry.pnl.toFixed(2)}`}
					mono
					positive={entry.pnl >= 0}
				/>
				<Field label={t("entry.duration")} value={entry.duration} />
			</div>

			{(entry.mfe !== undefined ||
				entry.mae !== undefined ||
				entry.riskReward !== undefined ||
				entry.edgeRatio !== undefined) && (
				<section style={{ marginBottom: 24 }}>
					<h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
						{t("analysis.title")}
					</h3>
					<div
						style={{
							display: "grid",
							gridTemplateColumns: "1fr 1fr",
							gap: 12,
						}}
					>
						{entry.mfe !== undefined && (
							<Field label={t("analysis.mfe")} value={entry.mfe.toFixed(2)} mono />
						)}
						{entry.mae !== undefined && (
							<Field label={t("analysis.mae")} value={entry.mae.toFixed(2)} mono />
						)}
						{entry.riskReward !== undefined && (
							<Field label={t("analysis.riskReward")} value={entry.riskReward.toFixed(2)} mono />
						)}
						{entry.edgeRatio !== undefined && (
							<Field label={t("analysis.edgeRatio")} value={entry.edgeRatio.toFixed(4)} mono />
						)}
					</div>
				</section>
			)}

			{entry.entryReason && (
				<section style={{ marginBottom: 16 }}>
					<h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
						{t("entry.entryReason")}
					</h3>
					<p style={{ color: "var(--text-secondary)" }}>{entry.entryReason}</p>
				</section>
			)}

			{entry.exitReason && (
				<section style={{ marginBottom: 16 }}>
					<h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
						{t("entry.exitReason")}
					</h3>
					<p style={{ color: "var(--text-secondary)" }}>{entry.exitReason}</p>
				</section>
			)}

			{entry.notes && (
				<section style={{ marginBottom: 16 }}>
					<h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
						{t("entry.notes")}
					</h3>
					<p style={{ color: "var(--text-secondary)" }}>{entry.notes}</p>
				</section>
			)}

			{entry.tags.length > 0 && (
				<section>
					<h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{t("entry.tags")}</h3>
					<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
						{entry.tags.map((tag) => (
							<span
								key={tag}
								style={{
									padding: "4px 10px",
									borderRadius: 4,
									fontSize: 12,
									background: "var(--surface-2, #374151)",
									color: "var(--text-secondary)",
								}}
							>
								{tag}
							</span>
						))}
					</div>
				</section>
			)}
		</div>
	);
}

function Field({
	label,
	value,
	mono,
	positive,
}: {
	label: string;
	value: string;
	mono?: boolean;
	positive?: boolean;
}) {
	return (
		<div>
			<div
				style={{
					fontSize: 11,
					fontWeight: 600,
					color: "var(--text-secondary)",
					textTransform: "uppercase",
					letterSpacing: "0.05em",
					marginBottom: 2,
				}}
			>
				{label}
			</div>
			<div
				style={{
					fontFamily: mono ? "monospace" : undefined,
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
