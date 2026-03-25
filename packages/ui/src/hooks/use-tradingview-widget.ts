"use client";

import { useEffect, useRef } from "react";

export interface UseTradingViewWidgetOptions {
	/** TradingView widget script src URL */
	scriptSrc: string;
	/** JSON config object passed to the widget */
	config: Record<string, unknown>;
	/** Container element ref */
	containerRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * Injects a TradingView widget embed script into the container.
 * Cleans up script and container innerHTML on unmount.
 *
 * TradingView widgets are initialized by placing a <script> tag with
 * a JSON config block inside the target container div.
 */
export function useTradingViewWidget({
	scriptSrc,
	config,
	containerRef,
}: UseTradingViewWidgetOptions): void {
	const configRef = useRef(config);
	configRef.current = config;

	useEffect(() => {
		const container = containerRef.current;
		if (!container || typeof document === "undefined") return;

		// TradingView widget: inject a script element with JSON config as text content
		const script = document.createElement("script");
		script.type = "text/javascript";
		script.src = scriptSrc;
		script.async = true;
		script.innerHTML = JSON.stringify(configRef.current);

		container.appendChild(script);

		return () => {
			// Remove the script and clear the container to stop the widget
			try {
				container.removeChild(script);
			} catch {
				// Script may already have been removed
			}
			// Clear any DOM injected by the widget
			container.innerHTML = "";
		};
	}, [scriptSrc, containerRef]);
}
