import { useTranslations } from "../../i18n";

const TIMEFRAMES = ["1m", "3m", "5m", "15m", "1h", "4h", "1d"] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];

export interface TimeframeSelectorProps {
	current: Timeframe;
	onSelect: (tf: Timeframe) => void;
}

export function TimeframeSelector({ current, onSelect }: TimeframeSelectorProps) {
	const t = useTranslations("charts");

	return (
		<div style={{ display: "flex", gap: 2 }}>
			{TIMEFRAMES.map((tf) => {
				const isActive = tf === current;
				return (
					<button
						key={tf}
						type="button"
						onClick={() => onSelect(tf)}
						style={{
							padding: "4px 10px",
							fontSize: 12,
							fontFamily: "var(--font-mono)",
							fontWeight: isActive ? 600 : 400,
							borderRadius: "var(--radius-sm)",
							border: "1px solid",
							borderColor: isActive ? "#22C55E" : "var(--border-subtle)",
							backgroundColor: isActive ? "rgba(34,197,94,0.1)" : "transparent",
							color: isActive ? "#22C55E" : "var(--text-secondary)",
							cursor: "pointer",
						}}
					>
						{t(`timeframes.${tf}`)}
					</button>
				);
			})}
		</div>
	);
}
