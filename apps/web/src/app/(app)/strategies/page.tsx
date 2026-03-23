"use client";

import { type StrategyListItem, StrategyListView } from "@combine/ui";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function StrategiesPage() {
	const router = useRouter();
	const [strategies, setStrategies] = useState<StrategyListItem[]>([]);

	useEffect(() => {
		fetch("/api/v1/strategies")
			.then((r) => r.json())
			.then((data) => setStrategies(data.items ?? []))
			.catch(() => {});
	}, []);

	return (
		<StrategyListView
			strategies={strategies}
			onCreateClick={() => router.push("/strategies/new")}
			onStrategyClick={(id) => router.push(`/strategies/${id}`)}
		/>
	);
}
