import { useSSE, type UseSSEReturn } from "./use-sse";

export interface StrategyPerformanceStats {
	strategyId: string;
	strategyName: string;
	symbol: string;
	winrate: number;
	expectancy: string;
	totalTrades: number;
	activeSince: number;
}

export interface UseStrategyPerformanceResult {
	strategies: StrategyPerformanceStats[];
	isLoading: boolean;
	error: Error | null;
}

interface StrategyPerformancePayload {
	strategies: StrategyPerformanceStats[];
}

export function useStrategyPerformance(apiBaseUrl = ""): UseStrategyPerformanceResult {
	const sse: UseSSEReturn<StrategyPerformancePayload> = useSSE<StrategyPerformancePayload>({
		url: `${apiBaseUrl}/api/v1/strategies/stream`,
		enabled: typeof globalThis.EventSource !== "undefined",
	});

	const data = sse.lastEvent?.data ?? null;
	const strategies = data?.strategies ?? [];
	const isLoading = data === null && sse.status !== "error";
	const error = sse.status === "error" ? new Error("SSE connection error") : null;

	return { strategies, isLoading, error };
}
