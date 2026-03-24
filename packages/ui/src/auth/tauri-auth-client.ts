/**
 * Tauri-specific better-auth client.
 *
 * Uses the vanilla `better-auth/client` (non-React) `createAuthClient` so
 * session management does not depend on the React version which relies on
 * browser-based cookie management that may not work reliably in the Tauri
 * WebView.
 *
 * The client wraps the vanilla client to satisfy `BetterAuthClientInstance`
 * (same interface as `createBetterAuthClient` from `./better-auth-client`).
 *
 * Session tokens are persisted to `@tauri-apps/plugin-store` (OS Keychain on
 * macOS/Windows/Linux) via a `StoreAdapter` that is dynamically imported by
 * default — or injected via `_storeAdapter` in tests.
 */
import { createAuthClient as _createVanillaAuthClient } from "better-auth/client";
import type { BetterAuthClientInstance } from "./better-auth-client.js";

// ---------------------------------------------------------------------------
// Store adapter (thin wrapper around @tauri-apps/plugin-store)
// ---------------------------------------------------------------------------

export interface StoreAdapter {
	set(key: string, value: unknown): Promise<void>;
	get<T = unknown>(key: string): Promise<T | null>;
	delete(key: string): Promise<void>;
	save(): Promise<void>;
}

/** Dynamically loads @tauri-apps/plugin-store and returns a StoreAdapter. */
async function buildTauriStoreAdapter(): Promise<StoreAdapter> {
	const { Store } = await import("@tauri-apps/plugin-store");
	const store = await Store.load("auth.json");
	return {
		set: (key, value) => store.set(key, value),
		get: <T>(key: string) => store.get<T>(key).then((v) => v ?? null),
		delete: (key) => store.delete(key),
		save: () => store.save(),
	};
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface TauriAuthClientOptions {
	/** Full URL of the API server, e.g. process.env.NEXT_PUBLIC_API_URL */
	baseURL: string;
	/**
	 * Optional store adapter — injected in tests to avoid Tauri runtime.
	 * If omitted, a real @tauri-apps/plugin-store adapter is built on demand.
	 */
	_storeAdapter?: StoreAdapter;
}

// ---------------------------------------------------------------------------
// Session state atom (minimal nanostore-compatible shape)
// ---------------------------------------------------------------------------

interface SessionState {
	data: { user: { id: string; email: string; role?: string } } | null;
	error: null | { message?: string };
	isPending: boolean;
	isRefetching: boolean;
	refetch: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Extended client interface that includes Tauri store helpers.
// The helpers are prefixed with `_` to signal they are internal/test-facing.
// ---------------------------------------------------------------------------

export interface TauriAuthClientInstance extends BetterAuthClientInstance {
	/** Persist session token and userId to the Tauri store. */
	_storeSession(opts: { token: string; userId: string }): Promise<void>;
	/** Remove session from the Tauri store. */
	_clearSession(): Promise<void>;
	/** Read the persisted session token from the Tauri store, or null. */
	_getStoredToken(): Promise<string | null>;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a Tauri-compatible better-auth client.
 *
 * The returned object satisfies `BetterAuthClientInstance` so it can be
 * passed as `authClient` to `<AuthProvider>` without changes.
 */
export function createTauriAuthClient(
	options: TauriAuthClientOptions,
): TauriAuthClientInstance {
	const { baseURL, _storeAdapter } = options;

	// Resolve the store adapter: injected adapter (tests) or dynamic import.
	let resolvedAdapter: StoreAdapter | null = _storeAdapter ?? null;

	async function getAdapter(): Promise<StoreAdapter> {
		if (resolvedAdapter) return resolvedAdapter;
		resolvedAdapter = await buildTauriStoreAdapter();
		return resolvedAdapter;
	}

	// Vanilla better-auth client (no React dependency).
	// Cast to any to avoid the complex inferred type — we only use the surface
	// we expose via BetterAuthClientInstance.
	// biome-ignore lint/suspicious/noExplicitAny: vanilla client type is too wide
	const vanilla = _createVanillaAuthClient({ baseURL }) as any;

	// Session state — kept in module scope per client instance.
	let sessionState: SessionState = {
		data: null,
		error: null,
		isPending: false,
		isRefetching: false,
		refetch: async () => {},
	};

	// ---------------------------------------------------------------------------
	// useSession — wraps the vanilla nanostore atom into a React-compatible hook.
	// The vanilla client exposes $store which has a get() returning the atom value.
	// We return a plain object here; when called inside React the caller should
	// wrap with useSyncExternalStore or call from within a React component.
	// ---------------------------------------------------------------------------
	function useSession(): SessionState {
		// If the vanilla client exposes a nanostore atom try to read it.
		try {
			// biome-ignore lint/suspicious/noExplicitAny: accessing internal atom
			const atom = (vanilla as any).$store;
			if (atom && typeof atom.get === "function") {
				const val = atom.get();
				if (val) {
					return {
						data: val.data ?? null,
						error: val.error ?? null,
						isPending: val.isPending ?? false,
						isRefetching: val.isRefetching ?? false,
						refetch: val.refetch ?? (async () => {}),
					};
				}
			}
		} catch {
			// fall through to cached state
		}
		return sessionState;
	}

	// ---------------------------------------------------------------------------
	// getSession — delegates to the vanilla client
	// ---------------------------------------------------------------------------
	async function getSession(): Promise<SessionState["data"]> {
		try {
			const result = await vanilla.getSession();
			if (result?.data) {
				sessionState = { ...sessionState, data: result.data, isPending: false };
				return result.data;
			}
		} catch {
			// ignore network errors
		}
		return null;
	}

	// ---------------------------------------------------------------------------
	// signOut — delegates to vanilla + clears Tauri store
	// ---------------------------------------------------------------------------
	async function signOut(opts?: Parameters<BetterAuthClientInstance["signOut"]>[0]): Promise<unknown> {
		const result = await vanilla.signOut(opts);
		sessionState = { ...sessionState, data: null, isPending: false };
		try {
			await (await getAdapter()).delete("session_token");
			await (await getAdapter()).delete("session_user_id");
			await (await getAdapter()).save();
		} catch {
			// store cleanup failure is non-fatal
		}
		return result;
	}

	// ---------------------------------------------------------------------------
	// Store helpers
	// ---------------------------------------------------------------------------

	async function _storeSession(opts: { token: string; userId: string }): Promise<void> {
		const adapter = await getAdapter();
		await adapter.set("session_token", opts.token);
		await adapter.set("session_user_id", opts.userId);
		await adapter.save();
	}

	async function _clearSession(): Promise<void> {
		const adapter = await getAdapter();
		await adapter.delete("session_token");
		await adapter.delete("session_user_id");
		await adapter.save();
	}

	async function _getStoredToken(): Promise<string | null> {
		const adapter = await getAdapter();
		return adapter.get<string>("session_token");
	}

	// Build signIn wrapper that also saves to Tauri store on success.
	// biome-ignore lint/suspicious/noExplicitAny: wrapping vanilla client method
	const signInEmail = async (emailOpts: any): Promise<any> => {
		const result = await vanilla.signIn.email(emailOpts);
		if (result && !result.error && result.data) {
			// Try to persist token if present in response
			const token =
				result.data.token ??
				result.data.session?.token ??
				null;
			const userId =
				result.data.user?.id ??
				result.data.session?.userId ??
				null;
			if (token && userId) {
				try {
					await _storeSession({ token, userId });
				} catch {
					// store write failure is non-fatal
				}
			}
		}
		return result;
	};

	const signIn = Object.assign(vanilla.signIn, { email: signInEmail });

	return {
		signIn,
		signOut,
		useSession,
		getSession,
		_storeSession,
		_clearSession,
		_getStoredToken,
	};
}
