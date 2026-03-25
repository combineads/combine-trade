export interface ApiClientConfig {
	baseUrl: string;
}

export interface ApiError {
	status: number;
	code: string;
	message: string;
}

export interface PaginatedResponse<T> {
	data: T[];
	total: number;
	page: number;
	pageSize: number;
}

/** Response shape for cursor-based candle pagination (chart data API). */
export interface CandleCursorResponse<T> {
	data: T[];
	nextCursor: string | null;
}

export function buildQueryString(params: Record<string, unknown>): string {
	const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null);
	if (entries.length === 0) return "";
	return entries
		.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
		.join("&");
}

export interface ApiClient {
	baseUrl: string;
	get: <T>(path: string, params?: Record<string, unknown>) => Promise<T>;
	post: <T>(path: string, body?: unknown) => Promise<T>;
	put: <T>(path: string, body?: unknown) => Promise<T>;
	delete: <T>(path: string) => Promise<T>;
}

export function createApiClient(config: ApiClientConfig): ApiClient {
	async function request<T>(
		path: string,
		init?: RequestInit,
		params?: Record<string, unknown>,
	): Promise<T> {
		const qs = params ? buildQueryString(params) : "";
		const url = `${config.baseUrl}${path}${qs ? `?${qs}` : ""}`;
		const res = await fetch(url, {
			...init,
			credentials: "include",
			headers: {
				"Content-Type": "application/json",
				...init?.headers,
			},
		});

		if (!res.ok) {
			const body = await res.json().catch(() => ({}));
			throw {
				status: res.status,
				code: body.code ?? "UNKNOWN",
				message: body.message ?? res.statusText,
			} satisfies ApiError;
		}

		return res.json();
	}

	return {
		baseUrl: config.baseUrl,
		get: <T>(path: string, params?: Record<string, unknown>) => request<T>(path, undefined, params),
		post: <T>(path: string, body?: unknown) =>
			request<T>(path, { method: "POST", body: JSON.stringify(body) }),
		put: <T>(path: string, body?: unknown) =>
			request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
		delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
	};
}

export const apiPaths = {
	// Strategies
	strategies: () => "/api/v1/strategies",
	strategy: (id: string) => `/api/v1/strategies/${id}`,
	strategyEvents: (id: string) => `/api/v1/strategies/${id}/events`,
	strategyStatistics: (id: string) => `/api/v1/strategies/${id}/statistics`,
	strategyMode: (id: string) => `/api/v1/strategies/${id}/mode`,

	// Risk
	killSwitchStatus: () => "/api/v1/risk/kill-switch/status",
	killSwitchActivate: () => "/api/v1/risk/kill-switch/activate",
	killSwitchDeactivate: () => "/api/v1/risk/kill-switch/deactivate",
	killSwitchEvents: () => "/api/v1/risk/kill-switch/events",

	// Data queries
	candles: () => "/api/v1/candles",
	candlesCursor: (symbol: string, timeframe: string) =>
		`/api/v1/candles/${encodeURIComponent(symbol)}/${encodeURIComponent(timeframe)}`,
	orders: () => "/api/v1/orders",
	alerts: () => "/api/v1/alerts",
	events: (id: string) => `/api/v1/events/${id}`,

	// Auth
	login: () => "/api/v1/auth/login",
	refresh: () => "/api/v1/auth/refresh",
	logout: () => "/api/v1/auth/logout",

	// SSE
	sse: () => "/api/v1/stream",

	// Backtest
	backtest: () => "/api/v1/backtest",

	// Health
	health: () => "/api/v1/health",
};
