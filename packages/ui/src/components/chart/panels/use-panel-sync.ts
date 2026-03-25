"use client";

import { useEffect } from "react";

/**
 * Options for the usePanelSync hook.
 * Both mainChart and panelChart are `unknown` to avoid a hard dependency on
 * the lightweight-charts types at compile time (they are loaded dynamically).
 */
export interface UsePanelSyncOptions {
	/** The primary (main) chart instance created by lightweight-charts. */
	mainChart: unknown | null;
	/** The secondary (panel) chart instance to synchronize with. */
	panelChart: unknown | null;
}

/**
 * usePanelSync
 *
 * Synchronizes crosshair movement and visible time range between a main chart
 * instance and a secondary panel chart instance using TradingView Lightweight
 * Charts v5 APIs:
 *   - `subscribeCrosshairMove` mirrors the crosshair position
 *   - `timeScale().subscribeVisibleTimeRangeChange` mirrors the visible range
 *
 * Unsubscribes all listeners on unmount or when chart references change.
 */
export function usePanelSync({ mainChart, panelChart }: UsePanelSyncOptions): void {
	useEffect(() => {
		if (!mainChart || !panelChart) return;

		// biome-ignore lint/suspicious/noExplicitAny: lightweight-charts dynamic import
		const main = mainChart as any;
		// biome-ignore lint/suspicious/noExplicitAny: lightweight-charts dynamic import
		const panel = panelChart as any;

		// ── Crosshair sync ──────────────────────────────────────────────────────
		const onCrosshairMove = (param: unknown) => {
			// biome-ignore lint/suspicious/noExplicitAny: lightweight-charts dynamic import
			const p = param as any;
			if (!p || !p.time) {
				panel.clearCrosshairPosition?.();
				return;
			}
			panel.setCrosshairPosition?.(p.point?.y ?? 0, p.time, panel.getSeries?.()[0]);
		};

		main.subscribeCrosshairMove?.(onCrosshairMove);

		// ── Visible range sync ──────────────────────────────────────────────────
		let isSyncing = false;

		const onMainRangeChange = (range: unknown) => {
			if (isSyncing || !range) return;
			isSyncing = true;
			try {
				// biome-ignore lint/suspicious/noExplicitAny: lightweight-charts dynamic import
				panel.timeScale?.().setVisibleRange?.(range as any);
			} finally {
				isSyncing = false;
			}
		};

		main.timeScale?.().subscribeVisibleTimeRangeChange?.(onMainRangeChange);

		return () => {
			main.unsubscribeCrosshairMove?.(onCrosshairMove);
			main.timeScale?.().unsubscribeVisibleTimeRangeChange?.(onMainRangeChange);
		};
	}, [mainChart, panelChart]);
}
