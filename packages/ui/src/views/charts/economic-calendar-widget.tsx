"use client";

import { useRef } from "react";
import { useTradingViewWidget } from "../../hooks/use-tradingview-widget";
import type { Theme } from "../../theme/theme-provider";

export interface EconomicCalendarWidgetProps {
	theme?: Theme;
	height?: number;
	className?: string;
}

/**
 * TradingView Economic Calendar widget embed.
 * Injects the TradingView economic calendar widget script on mount and cleans up on unmount.
 */
export function EconomicCalendarWidget({
	theme = "dark",
	height = 600,
	className,
}: EconomicCalendarWidgetProps) {
	const containerRef = useRef<HTMLDivElement>(null);

	useTradingViewWidget(containerRef, {
		widgetType: "events",
		theme,
		config: {
			width: "100%",
			height,
			locale: "en",
			importanceFilter: "-1,0,1",
		},
	});

	return (
		<div
			ref={containerRef}
			data-testid="economic-calendar-widget"
			className={className}
			style={{ height: `${height}px`, width: "100%" }}
		/>
	);
}
