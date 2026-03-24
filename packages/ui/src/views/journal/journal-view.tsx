import { useTranslations } from "../../i18n/use-translations";
import type { JournalEntry, JournalViewProps } from "./types";
import { JournalEntryRow } from "./journal-entry-row";
import { JournalFilters } from "./journal-filters";

export type { JournalEntry, JournalViewProps };

export function JournalView({
	entries,
	total,
	page,
	pageSize,
	filters,
	onFiltersChange,
	onPageChange,
	locale = "ko",
}: JournalViewProps) {
	const t = useTranslations("journal", locale);
	const tCommon = useTranslations("common", locale);

	return (
		<div>
			<h1
				style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", marginBottom: 24 }}
			>
				{t("pageTitle")}
			</h1>

			<JournalFilters filters={filters} onFiltersChange={onFiltersChange} locale={locale} />

			{entries.length === 0 ? (
				<p style={{ color: "var(--text-secondary)", padding: "32px 0", textAlign: "center" }}>
					{t("empty")}
				</p>
			) : (
				<table style={{ width: "100%", borderCollapse: "collapse" }}>
					<thead>
						<tr>
							<th style={thStyle}>{t("columns.date")}</th>
							<th style={thStyle}>{t("columns.symbol")}</th>
							<th style={thStyle}>{t("columns.side")}</th>
							<th style={{ ...thStyle, textAlign: "right" }}>{t("columns.entryPrice")}</th>
							<th style={{ ...thStyle, textAlign: "right" }}>{t("columns.exitPrice")}</th>
							<th style={{ ...thStyle, textAlign: "right" }}>{t("columns.pnl")}</th>
							<th style={thStyle}>{t("columns.duration")}</th>
							<th style={thStyle}>{t("columns.strategy")}</th>
							<th style={thStyle}>{t("columns.tags")}</th>
						</tr>
					</thead>
					<tbody>
						{entries.map((entry) => (
							<JournalEntryRow key={entry.id} entry={entry} locale={locale} />
						))}
					</tbody>
				</table>
			)}

			{total > pageSize && onPageChange && (
				<div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end", gap: 8 }}>
					<button
						type="button"
						onClick={() => onPageChange(page - 1)}
						disabled={page <= 1}
					>
						{tCommon("previous")}
					</button>
					<button
						type="button"
						onClick={() => onPageChange(page + 1)}
						disabled={page * pageSize >= total}
					>
						{tCommon("next")}
					</button>
				</div>
			)}
		</div>
	);
}

const thStyle: React.CSSProperties = {
	padding: "8px 12px",
	textAlign: "left",
	fontWeight: 600,
	borderBottom: "1px solid var(--border)",
	color: "var(--text-secondary)",
	fontSize: 12,
	textTransform: "uppercase",
	letterSpacing: "0.05em",
};
