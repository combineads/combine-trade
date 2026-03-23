"use client";

import { createBetterAuthClient } from "@combine/ui/src/auth/better-auth-client";

export const authClient = createBetterAuthClient({
	baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000",
});

export const { signIn, signOut, useSession, getSession } = authClient;
