"use client";

import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/top-bar";
import { useSession } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function AppLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const { data: session, isPending } = useSession();
	const router = useRouter();

	useEffect(() => {
		if (!isPending && !session) {
			router.replace("/login");
		}
	}, [isPending, session, router]);

	if (isPending) {
		return (
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					height: "100vh",
					color: "var(--text-muted)",
				}}
			>
				Loading...
			</div>
		);
	}

	if (!session) {
		return null;
	}

	return (
		<div style={{ display: "flex", height: "100vh" }}>
			<Sidebar />
			<div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
				<TopBar />
				<main
					style={{
						flex: 1,
						overflow: "auto",
						padding: "var(--content-padding)",
						maxWidth: "var(--content-max-width)",
					}}
				>
					{children}
				</main>
			</div>
		</div>
	);
}
