"use client";

import { useRef } from "react";
import { useTradingViewWidget } from "../../hooks/use-tradingview-widget";
import type { Theme } from "../../theme/theme-provider";

export interface TimelineWidgetProps {
	theme?: Theme;
	height?: number;
	className?: string;
}

/**
 * TradingView Timeline (news) widget embed.
 * Injects the TradingView timeline widget script on mount and cleans up on unmount.
 */
export function TimelineWidget({ theme = "dark", height = 550, className }: TimelineWidgetProps) {
	const containerRef = useRef<HTMLDivElement>(null);

	useTradingViewWidget(containerRef, {
		widgetType: "timeline",
		theme,
		config: {
			displayMode: "adaptive",
			width: "100%",
			height,
			locale: "en",
		},
	});

	return (
		<div
			ref={containerRef}
			data-testid="timeline-widget"
			className={className}
			style={{ height: `${height}px`, width: "100%" }}
		/>
	);
}
