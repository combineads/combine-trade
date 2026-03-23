"use client";

import type { ReactNode } from "react";
import { useAuth } from "./use-auth";

export interface ProtectedRouteProps {
	children: ReactNode;
	redirectTo?: string;
}

/** Pure logic helpers — testable without React */
export function shouldRedirect(state: { isAuthenticated: boolean; isLoading: boolean }): boolean {
	return !state.isAuthenticated && !state.isLoading;
}

export function shouldRenderNothing(state: {
	isAuthenticated: boolean;
	isLoading: boolean;
}): boolean {
	return state.isLoading;
}

export function shouldRenderChildren(state: {
	isAuthenticated: boolean;
	isLoading: boolean;
}): boolean {
	return state.isAuthenticated && !state.isLoading;
}

export function ProtectedRoute({ children, redirectTo = "/login" }: ProtectedRouteProps) {
	const { isAuthenticated, isLoading } = useAuth();

	if (shouldRenderNothing({ isAuthenticated, isLoading })) {
		return null;
	}

	if (shouldRedirect({ isAuthenticated, isLoading })) {
		// In a real app this would use router.replace(redirectTo)
		// Keeping it as a type-safe redirect marker for now
		if (typeof window !== "undefined") {
			window.location.replace(redirectTo);
		}
		return null;
	}

	return <>{children}</>;
}
