/**
 * better-auth React client instance for apps/web.
 *
 * baseURL comes from the NEXT_PUBLIC_API_URL env var so it can be
 * pointed at any environment (dev, staging, prod) without code changes.
 */
import { createBetterAuthClient } from "@combine/ui/src/auth/better-auth-client";

export const authClient = createBetterAuthClient({
	baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3100",
});

export const { signIn, signOut, useSession, getSession } = authClient;
