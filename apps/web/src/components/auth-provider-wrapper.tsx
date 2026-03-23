"use client";

import { AuthProvider } from "@combine/ui";
import { authClient } from "@/lib/auth-client";
import type { ReactNode } from "react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3100";

/**
 * Client component wrapper that binds the better-auth client instance
 * to AuthProvider. The root layout is a Server Component so it cannot
 * import the auth client directly (it uses React hooks internally).
 */
export function AuthProviderWrapper({ children }: { children: ReactNode }) {
	return (
		<AuthProvider apiBaseUrl={API_BASE_URL} authClient={authClient}>
			{children}
		</AuthProvider>
	);
}
