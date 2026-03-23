"use client";

import { authClient } from "@/lib/auth-client";
import { AuthProvider } from "@combine/ui";
import type { ReactNode } from "react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

export function AuthProviderWrapper({ children }: { children: ReactNode }) {
	return (
		<AuthProvider apiBaseUrl={API_BASE_URL} authClient={authClient}>
			{children}
		</AuthProvider>
	);
}
