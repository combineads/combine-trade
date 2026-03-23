"use client";

import { StrategyCreateView } from "@combine/ui";
import { useRouter } from "next/navigation";

export default function NewStrategyPage() {
	const router = useRouter();
	return <StrategyCreateView onCancel={() => router.push("/strategies")} />;
}
