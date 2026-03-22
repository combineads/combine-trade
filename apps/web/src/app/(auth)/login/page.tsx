"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoginView } from "@combine/ui/src/views/auth/login-view";

export default function LoginPage() {
	const router = useRouter();
	const [error, setError] = useState<string>();
	const [loading, setLoading] = useState(false);

	async function handleSubmit(username: string, password: string) {
		setError(undefined);
		setLoading(true);
		try {
			const res = await fetch(
				`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000"}/api/v1/auth/login`,
				{
					method: "POST",
					credentials: "include",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ username, password }),
				},
			);
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				setError(body.message ?? "Login failed");
				return;
			}
			router.push("/dashboard");
		} catch {
			setError("Network error");
		} finally {
			setLoading(false);
		}
	}

	return <LoginView onSubmit={handleSubmit} error={error} loading={loading} />;
}
