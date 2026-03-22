export interface AuthApiClientOptions {
	baseUrl: string;
	getToken(): string | null;
	onUnauthorized(): Promise<void>;
}

export interface AuthApiClient {
	get<T>(path: string): Promise<T>;
	post<T>(path: string, body?: unknown): Promise<T>;
}

export function createAuthApiClient(options: AuthApiClientOptions): AuthApiClient {
	async function request<T>(path: string, init?: RequestInit, isRetry = false): Promise<T> {
		const token = options.getToken();
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
		};
		if (token) {
			headers.Authorization = `Bearer ${token}`;
		}

		const res = await fetch(`${options.baseUrl}${path}`, {
			...init,
			credentials: "include",
			headers: {
				...headers,
				...init?.headers,
			},
		});

		if (res.status === 401 && !isRetry) {
			await options.onUnauthorized();
			return request<T>(path, init, true);
		}

		if (!res.ok) {
			const body = await res.json().catch(() => ({}));
			throw new Error(body.message ?? `Request failed: ${res.status}`);
		}

		return res.json();
	}

	return {
		get: <T>(path: string) => request<T>(path),
		post: <T>(path: string, body?: unknown) =>
			request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
	};
}
