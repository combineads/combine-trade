import type { getTranslations } from "../../i18n";
import { type Direction, DirectionBadge } from "../../components/badge";

type Translator = ReturnType<typeof getTranslations>;

export interface RecentEventItem {
	id: string;
	symbol: string;
	direction: Direction;
	strategyName: string;
	createdAt: string;
}

export interface RecentEventsProps {
	events: RecentEventItem[];
	/** Dashboard namespace translator. Defaults to hardcoded English strings when omitted. */
	t?: Translator;
}

export function RecentEvents({ events, t }: RecentEventsProps) {
	if (events.length === 0) {
		const emptyText = t ? t("recentEvents.noEvents") : "No events detected";
		return (
			<div style={{ color: "var(--text-muted)", fontSize: 14, padding: 16 }}>
				{emptyText}
			</div>
		);
	}

	return (
		<div style={{ display: "grid", gap: 8 }}>
			{events.map((e) => (
				<div
					key={e.id}
					style={{
						display: "flex",
						alignItems: "center",
						gap: 12,
						padding: "8px 12px",
						borderRadius: "var(--radius-sm)",
						backgroundColor: "var(--bg-card)",
						border: "1px solid var(--border-subtle)",
					}}
				>
					<DirectionBadge direction={e.direction} />
					<span
						style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-primary)" }}
					>
						{e.symbol}
					</span>
					<span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{e.strategyName}</span>
					<span
						style={{
							marginLeft: "auto",
							fontSize: 12,
							color: "var(--text-muted)",
							fontFamily: "var(--font-mono)",
						}}
					>
						{e.createdAt}
					</span>
				</div>
			))}
		</div>
	);
}
