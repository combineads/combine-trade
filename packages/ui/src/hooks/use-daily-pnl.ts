import { useSSE, type UseSSEReturn } from "./use-sse";

export interface PnlPoint {
	time: number;
	realizedPnl: string;
	cumulativePnl: string;
}

export interface UseDailyPnlResult {
	points: PnlPoint[];
	totalPnl: string;
	isLoading: boolean;
	error: Error | null;
}

interface DailyPnlPayload {
	points: PnlPoint[];
	totalPnl: string;
}

export function useDailyPnl(apiBaseUrl = ""): UseDailyPnlResult {
	const sse: UseSSEReturn<DailyPnlPayload> = useSSE<DailyPnlPayload>({
		url: `${apiBaseUrl}/api/v1/pnl/stream`,
		enabled: typeof globalThis.EventSource !== "undefined",
	});

	const data = sse.lastEvent?.data ?? null;
	const points = data?.points ?? [];
	const totalPnl = data?.totalPnl ?? "0";
	const isLoading = data === null && sse.status !== "error";
	const error = sse.status === "error" ? new Error("SSE connection error") : null;

	return { points, totalPnl, isLoading, error };
}
