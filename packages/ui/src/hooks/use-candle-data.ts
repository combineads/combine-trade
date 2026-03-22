"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { OHLCVBar } from "../views/charts/lightweight-chart";

export interface UseCandleDataOptions {
	symbol: string;
	timeframe: string;
	apiBaseUrl?: string;
}

export interface UseCandleDataResult {
	bars: OHLCVBar[];
	isLoading: boolean;
	error: Error | null;
	fetchMore: () => void;
	hasMore: boolean;
}

interface ApiCandle {
	openTime: string;
	open: string;
	high: string;
	low: string;
	close: string;
	volume?: string;
}

const PAGE_SIZE = 500;

/** Parse API candle response to OHLCVBar array. Exported for testing. */
export function parseCandleResponse(data: ApiCandle[]): OHLCVBar[] {
	return data.map((c) => ({
		time: Math.floor(new Date(c.openTime).getTime() / 1000),
		open: Number(c.open),
		high: Number(c.high),
		low: Number(c.low),
		close: Number(c.close),
		volume: c.volume ? Number(c.volume) : undefined,
	}));
}

/** Merge two bar arrays, deduplicate by time (incoming wins), sort ascending. Exported for testing. */
export function mergeBars(existing: OHLCVBar[], incoming: OHLCVBar[]): OHLCVBar[] {
	const map = new Map<number, OHLCVBar>();
	for (const bar of existing) map.set(bar.time, bar);
	for (const bar of incoming) map.set(bar.time, bar);
	return Array.from(map.values()).sort((a, b) => a.time - b.time);
}

export function useCandleData(options: UseCandleDataOptions): UseCandleDataResult {
	const { symbol, timeframe, apiBaseUrl = "" } = options;
	const [bars, setBars] = useState<OHLCVBar[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<Error | null>(null);
	const [hasMore, setHasMore] = useState(true);
	const pageRef = useRef(1);

	useEffect(() => {
		if (typeof globalThis.window === "undefined") return;

		let cancelled = false;
		setIsLoading(true);
		setError(null);
		pageRef.current = 1;

		(async () => {
			try {
				const url = `${apiBaseUrl}/api/v1/candles?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}&page=1&pageSize=${PAGE_SIZE}`;
				const res = await fetch(url);
				if (!res.ok) throw new Error(`API error: ${res.status}`);
				const json = await res.json();
				if (cancelled) return;

				const parsed = parseCandleResponse(json.data ?? []);
				setBars(parsed);
				setHasMore((json.data?.length ?? 0) >= PAGE_SIZE);
			} catch (err) {
				if (!cancelled) setError(err as Error);
			} finally {
				if (!cancelled) setIsLoading(false);
			}
		})();

		// SSE subscription for live updates
		let eventSource: EventSource | undefined;
		if (typeof globalThis.EventSource !== "undefined") {
			try {
				const sseUrl = `${apiBaseUrl}/api/v1/stream`;
				eventSource = new EventSource(sseUrl);
				eventSource.addEventListener("candle", (e) => {
					try {
						const data = JSON.parse(e.data);
						if (data.symbol === symbol && data.timeframe === timeframe) {
							const bar: OHLCVBar = {
								time: Math.floor(new Date(data.openTime).getTime() / 1000),
								open: Number(data.open),
								high: Number(data.high),
								low: Number(data.low),
								close: Number(data.close),
								volume: data.volume ? Number(data.volume) : undefined,
							};
							setBars((prev) => mergeBars(prev, [bar]));
						}
					} catch { /* ignore malformed SSE */ }
				});
				eventSource.onerror = () => {
					// SSE errors are non-fatal — data still available from initial fetch
				};
			} catch { /* EventSource not available */ }
		}

		return () => {
			cancelled = true;
			eventSource?.close();
		};
	}, [symbol, timeframe, apiBaseUrl]);

	const fetchMore = useCallback(() => {
		if (!hasMore || isLoading) return;
		setIsLoading(true);
		pageRef.current += 1;
		const page = pageRef.current;

		(async () => {
			try {
				const url = `${apiBaseUrl}/api/v1/candles?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}&page=${page}&pageSize=${PAGE_SIZE}`;
				const res = await fetch(url);
				if (!res.ok) throw new Error(`API error: ${res.status}`);
				const json = await res.json();

				const parsed = parseCandleResponse(json.data ?? []);
				setBars((prev) => mergeBars(parsed, prev));
				setHasMore((json.data?.length ?? 0) >= PAGE_SIZE);
			} catch (err) {
				setError(err as Error);
			} finally {
				setIsLoading(false);
			}
		})();
	}, [symbol, timeframe, apiBaseUrl, hasMore, isLoading]);

	return { bars, isLoading, error, fetchMore, hasMore };
}
