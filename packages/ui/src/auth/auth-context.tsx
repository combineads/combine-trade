"use client";

import { createContext, useCallback, useEffect, useState, type ReactNode } from "react";

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
}

export function AuthProvider({ children, apiBaseUrl }: AuthProviderProps) {
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
