"use client";

import { StrategyEditorView, type StrategyDetail, type StrategyStatsData } from "@combine/ui";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const emptyStats: StrategyStatsData = {
	winrate: 0,
	expectancy: 0,
	sampleCount: 0,
	totalEvents: 0,
	avgHoldBars: 0,
};

export default function StrategyDetailPage() {
	const params = useParams<{ id: string }>();
	const router = useRouter();
	const [strategy, setStrategy] = useState<StrategyDetail | null>(null);
	const [stats, setStats] = useState<StrategyStatsData>(emptyStats);

	useEffect(() => {
		fetch(`/api/v1/strategies/${params.id}`)
			.then((r) => r.json())
			.then((data) => setStrategy(data))
			.catch(() => {});

		fetch(`/api/v1/strategies/${params.id}/statistics`)
			.then((r) => r.json())
			.then((data) => setStats(data))
			.catch(() => {});
	}, [params.id]);

	if (!strategy) {
		return <div style={{ padding: 48, textAlign: "center", color: "var(--text-muted)" }}>Loading...</div>;
	}

	return (
		<StrategyEditorView
			strategy={strategy}
			stats={stats}
			onBack={() => router.push("/strategies")}
			onSave={(code) => {
				fetch(`/api/v1/strategies/${params.id}`, {
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ code }),
				}).catch(() => {});
			}}
		/>
	);
}
