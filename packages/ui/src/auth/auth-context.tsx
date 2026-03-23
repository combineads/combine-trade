"use client";

import { createContext, useCallback, useEffect, useState, type ReactNode } from "react";
import type { BetterAuthClientInstance } from "./better-auth-client";

export interface AuthUser {
	id: string;
	email: string;
	role: string;
}

export interface AuthState {
	user: AuthUser | null;
	accessToken: string | null;
	isAuthenticated: boolean;
	isLoading: boolean;
}

export interface AuthContextValue extends AuthState {
	login(email: string, password: string): Promise<void>;
	logout(): Promise<void>;
	refresh(): Promise<void>;
}

export const initialAuthState: AuthState = {
	user: null,
	accessToken: null,
	isAuthenticated: false,
	isLoading: true,
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export interface AuthProviderProps {
	children: ReactNode;
	apiBaseUrl: string;
	/**
	 * Optional better-auth React client instance.
	 *
	 * When provided the AuthProvider uses better-auth's session management
	 * (signIn/signOut/useSession) instead of the legacy fetch-based endpoints.
	 * Apps should pass the authClient created in their lib/auth-client.ts.
	 *
	 * When omitted the provider falls back to the legacy /api/v1/auth/* endpoints
	 * to preserve backwards-compatibility during the migration period.
	 */
	authClient?: BetterAuthClientInstance;
}

// ---------------------------------------------------------------------------
// Session shape returned by better-auth's useSession hook.
// We pull only what we need to avoid importing better-auth internals here.
// ---------------------------------------------------------------------------
interface BetterAuthSession {
	user?: { id?: string; email?: string; role?: string } | null;
}

// ---------------------------------------------------------------------------
// BetterAuthProvider — uses better-auth React client hooks.
// Hooks are called unconditionally at the top level of this component.
// ---------------------------------------------------------------------------
function BetterAuthProvider({
	children,
	authClient,
}: {
	children: ReactNode;
	authClient: BetterAuthClientInstance;
}) {
	const [state, setState] = useState<AuthState>(initialAuthState);

	// useSession is a real React hook — called unconditionally here.
	const { data, isPending } = authClient.useSession();

	useEffect(() => {
		const sessionData = data as BetterAuthSession | null | undefined;
		if (isPending) {
			setState((prev) => ({ ...prev, isLoading: true }));
			return;
		}
		if (sessionData?.user) {
			setState({
				user: {
					id: sessionData.user.id ?? "",
					email: sessionData.user.email ?? "",
					role: (sessionData.user.role as string | undefined) ?? "user",
				},
				// better-auth uses httpOnly cookies; no JS-accessible token
				accessToken: null,
				isAuthenticated: true,
				isLoading: false,
			});
		} else {
			setState({ user: null, accessToken: null, isAuthenticated: false, isLoading: false });
		}
	}, [data, isPending]);

	const login = useCallback(
		async (email: string, password: string) => {
			const result = await authClient.signIn.email({
				email,
				password,
				callbackURL: "/dashboard",
			});
			// better-auth signIn returns { error } on failure
			if (result && typeof result === "object" && "error" in result && result.error) {
				const err = result.error as { message?: string };
				throw new Error(err.message ?? "Login failed");
			}
		},
		[authClient],
	);

	const logout = useCallback(async () => {
		await authClient.signOut({
			fetchOptions: {
				onSuccess: () => {
					if (typeof window !== "undefined") {
						window.location.href = "/login";
					}
				},
			},
		});
		setState({ user: null, accessToken: null, isAuthenticated: false, isLoading: false });
	}, [authClient]);

	// refresh is a no-op for better-auth: useSession handles it automatically.
	const refresh = useCallback(async () => {}, []);

	return (
		<AuthContext.Provider value={{ ...state, login, logout, refresh }}>
			{children}
		</AuthContext.Provider>
	);
}

// ---------------------------------------------------------------------------
// LegacyAuthProvider — uses fetch-based /api/v1/auth/* endpoints.
// Preserved for backwards-compatibility during the migration period.
// ---------------------------------------------------------------------------
function LegacyAuthProvider({
	children,
	apiBaseUrl,
}: {
	children: ReactNode;
	apiBaseUrl: string;
}) {
	const [state, setState] = useState<AuthState>(initialAuthState);

	const refresh = useCallback(async () => {
		try {
			const res = await fetch(`${apiBaseUrl}/api/v1/auth/refresh`, {
				method: "POST",
				credentials: "include",
			});
			if (!res.ok) {
				setState({ user: null, accessToken: null, isAuthenticated: false, isLoading: false });
				return;
			}
			const data = await res.json();
			setState({
				user: data.user,
				accessToken: data.accessToken,
				isAuthenticated: true,
				isLoading: false,
			});
		} catch {
			setState({ user: null, accessToken: null, isAuthenticated: false, isLoading: false });
		}
	}, [apiBaseUrl]);

	const login = useCallback(
		async (email: string, password: string) => {
			const res = await fetch(`${apiBaseUrl}/api/v1/auth/login`, {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email, password }),
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(body.message ?? "Login failed");
			}
			const data = await res.json();
			setState({
				user: data.user,
				accessToken: data.accessToken,
				isAuthenticated: true,
				isLoading: false,
			});
		},
		[apiBaseUrl],
	);

	const logout = useCallback(async () => {
		await fetch(`${apiBaseUrl}/api/v1/auth/logout`, {
			method: "POST",
			credentials: "include",
		}).catch(() => {});
		setState({ user: null, accessToken: null, isAuthenticated: false, isLoading: false });
	}, [apiBaseUrl]);

	// Silent refresh on mount
	useEffect(() => {
		refresh();
	}, [refresh]);

	return (
		<AuthContext.Provider value={{ ...state, login, logout, refresh }}>
			{children}
		</AuthContext.Provider>
	);
}

// ---------------------------------------------------------------------------
// Public AuthProvider — selects implementation based on authClient prop.
// The selection is stable at runtime (authClient is module-level singleton).
// ---------------------------------------------------------------------------
export function AuthProvider({ children, apiBaseUrl, authClient }: AuthProviderProps) {
	if (authClient) {
		return (
			<BetterAuthProvider authClient={authClient}>
				{children}
			</BetterAuthProvider>
		);
	}
	return (
		<LegacyAuthProvider apiBaseUrl={apiBaseUrl}>
			{children}
		</LegacyAuthProvider>
	);
}
