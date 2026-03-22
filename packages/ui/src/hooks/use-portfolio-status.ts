import { useSSE, type UseSSEReturn } from "./use-sse";

export interface PortfolioPosition {
	symbol: string;
	side: "LONG" | "SHORT";
	size: string;
	entryPrice: string;
	markPrice: string;
	unrealizedPnl: string;
}

export interface PortfolioStatus {
	balance: string;
	totalUnrealizedPnl: string;
	positions: PortfolioPosition[];
	updatedAt: number;
}

export interface UsePortfolioStatusResult {
	status: PortfolioStatus | null;
	isLoading: boolean;
	error: Error | null;
}

export function usePortfolioStatus(apiBaseUrl = ""): UsePortfolioStatusResult {
	const sse: UseSSEReturn<PortfolioStatus> = useSSE<PortfolioStatus>({
		url: `${apiBaseUrl}/api/v1/portfolio/stream`,
		enabled: typeof globalThis.EventSource !== "undefined",
	});

	const status = sse.lastEvent?.data ?? null;
	const isLoading = status === null && sse.status !== "error";
	const error = sse.status === "error" ? new Error("SSE connection error") : null;

	return { status, isLoading, error };
}
