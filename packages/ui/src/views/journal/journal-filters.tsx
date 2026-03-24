import { useTranslations } from "../../i18n/use-translations";
import type { JournalFiltersState } from "./types";
import type { Locale } from "../../i18n/use-translations";

interface JournalFiltersProps {
	filters?: JournalFiltersState;
	onFiltersChange?: (filters: JournalFiltersState) => void;
	locale?: Locale;
}

export function JournalFilters({
	filters = {},
	onFiltersChange,
	locale = "ko",
}: JournalFiltersProps) {
	const t = useTranslations("journal", locale);

	function update(patch: Partial<JournalFiltersState>) {
		onFiltersChange?.({ ...filters, ...patch });
	}

	return (
		<div
			style={{
				display: "flex",
				gap: 12,
				flexWrap: "wrap",
				marginBottom: 20,
				padding: "12px 16px",
				background: "var(--surface-1, #1f2937)",
				borderRadius: 8,
			}}
		>
			<input
				type="text"
				placeholder={t("filters.searchPlaceholder")}
				value={filters.search ?? ""}
				onChange={(e) => update({ search: e.target.value })}
				style={inputStyle}
				aria-label={t("filters.searchPlaceholder")}
			/>

			<div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
				<label style={labelStyle}>{t("filters.dateRange")}</label>
				<div style={{ display: "flex", gap: 8 }}>
					<input
						type="date"
						value={filters.dateFrom ?? ""}
						onChange={(e) => update({ dateFrom: e.target.value })}
						style={inputStyle}
						aria-label={t("filters.dateRange")}
					/>
					<input
						type="date"
						value={filters.dateTo ?? ""}
						onChange={(e) => update({ dateTo: e.target.value })}
						style={inputStyle}
						aria-label={t("filters.dateRange")}
					/>
				</div>
			</div>

			<div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
				<label style={labelStyle}>{t("filters.symbol")}</label>
				<input
					type="text"
					placeholder="BTC/USDT"
					value={filters.symbol ?? ""}
					onChange={(e) => update({ symbol: e.target.value })}
					style={inputStyle}
					aria-label={t("filters.symbol")}
				/>
			</div>

			<div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
				<label style={labelStyle}>{t("filters.side")}</label>
				<select
					value={filters.side ?? ""}
					onChange={(e) =>
						update({ side: e.target.value as JournalFiltersState["side"] })
					}
					style={inputStyle}
					aria-label={t("filters.side")}
				>
					<option value="">—</option>
					<option value="LONG">LONG</option>
					<option value="SHORT">SHORT</option>
				</select>
			</div>
		</div>
	);
}

const inputStyle: React.CSSProperties = {
	padding: "6px 10px",
	borderRadius: 6,
	border: "1px solid var(--border)",
	background: "var(--surface-0, #111827)",
	color: "var(--text-primary)",
	fontSize: 13,
};

const labelStyle: React.CSSProperties = {
	fontSize: 11,
	fontWeight: 600,
	color: "var(--text-secondary)",
	textTransform: "uppercase",
	letterSpacing: "0.05em",
};
