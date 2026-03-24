import { useTranslations, type Locale } from "../../i18n";

export type EventOutcome = "WIN" | "LOSS" | "TIME_EXIT" | "OPEN";

export interface StrategyEvent {
	id: string;
	direction: "LONG" | "SHORT";
	outcome: EventOutcome;
	symbol: string;
	entryPrice: number;
	exitPrice?: number;
	pnl?: number;
	winRate?: number;
	timestamp: number;
}

export interface StrategyEventsTabProps {
	events: StrategyEvent[];
	totalCount?: number;
	page?: number;
	pageSize?: number;
	onPageChange?: (page: number) => void;
	loading?: boolean;
	locale?: Locale;
}

function formatDate(ts: number): string {
	const d = new Date(ts);
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	const h = String(d.getHours()).padStart(2, "0");
	const min = String(d.getMinutes()).padStart(2, "0");
	return `${y}-${m}-${day} ${h}:${min}`;
}

const OUTCOME_COLORS: Record<EventOutcome, string> = {
	WIN: "#22C55E",
	LOSS: "#EF4444",
	TIME_EXIT: "#F59E0B",
	OPEN: "#64748B",
};

export function StrategyEventsTab({ events, loading = false, locale }: StrategyEventsTabProps) {
	const t = useTranslations("strategies", locale);

	if (loading) {
		return (
			<div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>
				{t("events.loading")}
			</div>
		);
	}

	if (events.length === 0) {
		return (
			<div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>
				{t("events.empty")}
			</div>
		);
	}

	const columns = [
		t("events.columns.direction"),
		t("events.columns.symbol"),
		t("events.columns.entry"),
		t("events.columns.exit"),
		t("events.columns.pnl"),
		t("events.columns.outcome"),
		t("events.columns.time"),
	];

	return (
		<div>
			<table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
				<thead>
					<tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
						{columns.map((h) => (
							<th
								key={h}
								style={{
									padding: "8px 12px",
									textAlign: "left",
									fontSize: 11,
									color: "var(--text-muted)",
									textTransform: "uppercase",
									letterSpacing: "0.05em",
									fontWeight: 500,
								}}
							>
								{h}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{events.map((event, idx) => (
						<tr
							key={event.id}
							style={{
								borderBottom: "1px solid var(--border-subtle)",
								backgroundColor: idx % 2 === 1 ? "var(--bg-elevated)" : "transparent",
							}}
						>
							<td style={{ padding: "8px 12px" }}>
								<span
									style={{
										fontSize: 11,
										fontWeight: 600,
										color: event.direction === "LONG" ? "#22C55E" : "#EF4444",
									}}
								>
									{event.direction}
								</span>
							</td>
							<td style={{ padding: "8px 12px", fontFamily: "var(--font-mono)" }}>
								{event.symbol}
							</td>
							<td
								style={{ padding: "8px 12px", fontFamily: "var(--font-mono)", textAlign: "right" }}
							>
								{event.entryPrice.toLocaleString()}
							</td>
							<td
								style={{ padding: "8px 12px", fontFamily: "var(--font-mono)", textAlign: "right" }}
							>
								{event.exitPrice != null ? event.exitPrice.toLocaleString() : "—"}
							</td>
							<td
								style={{
									padding: "8px 12px",
									fontFamily: "var(--font-mono)",
									textAlign: "right",
									color:
										event.pnl != null
											? event.pnl > 0
												? "#22C55E"
												: "#EF4444"
											: "var(--text-muted)",
								}}
							>
								{event.pnl != null ? event.pnl.toLocaleString() : "—"}
							</td>
							<td style={{ padding: "8px 12px" }}>
								<span
									style={{
										fontSize: 11,
										fontWeight: 600,
										color: OUTCOME_COLORS[event.outcome],
									}}
								>
									{event.outcome}
								</span>
							</td>
							<td style={{ padding: "8px 12px", fontSize: 12, color: "var(--text-muted)" }}>
								{formatDate(event.timestamp)}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
