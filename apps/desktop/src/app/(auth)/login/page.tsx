"use client";

import { authClient } from "@/lib/auth-client";
import { LoginView } from "@combine/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
	const router = useRouter();
	const [error, setError] = useState<string>();
	const [loading, setLoading] = useState(false);

	async function handleSubmit(email: string, password: string) {
		setError(undefined);
		setLoading(true);
		try {
			const result = await authClient.signIn.email({
				email,
				password,
				callbackURL: "/dashboard",
			});
			if (result && typeof result === "object" && "error" in result && result.error) {
				const err = result.error as { message?: string };
				setError(err.message ?? "Login failed");
				return;
			}
			router.push("/dashboard");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Network error");
		} finally {
			setLoading(false);
		}
	}

	return <LoginView onSubmit={handleSubmit} error={error} loading={loading} />;
}
