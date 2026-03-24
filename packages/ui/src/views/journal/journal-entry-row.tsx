import type { JournalEntry } from "./types";
import type { Locale } from "../../i18n/use-translations";

interface JournalEntryRowProps {
	entry: JournalEntry;
	locale?: Locale;
}

export function JournalEntryRow({ entry, locale: _locale = "ko" }: JournalEntryRowProps) {
	const pnlColor = entry.pnl >= 0 ? "var(--color-success, #10b981)" : "var(--color-danger, #ef4444)";

	return (
		<tr style={{ borderBottom: "1px solid var(--border)" }}>
			<td style={tdStyle}>{entry.tradeDate}</td>
			<td style={{ ...tdStyle, fontFamily: "monospace" }}>{entry.symbol}</td>
			<td style={tdStyle}>
				<span
					style={{
						color: entry.side === "LONG" ? "var(--color-success, #10b981)" : "var(--color-danger, #ef4444)",
						fontWeight: 600,
					}}
				>
					{entry.side}
				</span>
			</td>
			<td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace" }}>
				{entry.entryPrice.toFixed(2)}
			</td>
			<td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace" }}>
				{entry.exitPrice.toFixed(2)}
			</td>
			<td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace", color: pnlColor, fontWeight: 600 }}>
				{entry.pnl >= 0 ? "+" : ""}
				{entry.pnl.toFixed(2)}
			</td>
			<td style={tdStyle}>{entry.duration}</td>
			<td style={tdStyle}>{entry.strategyName}</td>
			<td style={tdStyle}>
				{entry.tags.map((tag) => (
					<span
						key={tag}
						style={{
							display: "inline-block",
							padding: "2px 6px",
							marginRight: 4,
							borderRadius: 4,
							fontSize: 11,
							background: "var(--surface-2, #374151)",
							color: "var(--text-secondary)",
						}}
					>
						{tag}
					</span>
				))}
			</td>
		</tr>
	);
}

const tdStyle: React.CSSProperties = {
	padding: "10px 12px",
	verticalAlign: "middle",
};
