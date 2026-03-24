import { ChartContainer } from "../../components/chart-container";
import { useTranslations } from "../../i18n";
import { type Timeframe, TimeframeSelector } from "./timeframe-selector";

export interface CandlestickChartViewProps {
	symbol: string;
	timeframe: Timeframe;
	onTimeframeChange?: (tf: Timeframe) => void;
	onSymbolChange?: (symbol: string) => void;
}

export function CandlestickChartView({
	symbol,
	timeframe,
	onTimeframeChange,
	onSymbolChange,
}: CandlestickChartViewProps) {
	const t = useTranslations("charts");

	return (
		<div>
			{/* Chart header */}
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 16,
					marginBottom: 8,
				}}
			>
				<button
					type="button"
					onClick={() => onSymbolChange?.(symbol)}
					style={{
						fontSize: 15,
						fontWeight: 700,
						fontFamily: "var(--font-mono)",
						color: "var(--text-primary)",
						background: "none",
						border: "none",
						cursor: "pointer",
						padding: 0,
					}}
					aria-label={t("candlestick")}
				>
					{symbol}
				</button>
				<TimeframeSelector current={timeframe} onSelect={(tf) => onTimeframeChange?.(tf)} />
			</div>

			{/* Chart area — lightweight-charts will be mounted here client-side */}
			<ChartContainer width="100%" height={400} />
		</div>
	);
}
