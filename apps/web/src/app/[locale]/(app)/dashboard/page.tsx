import { DashboardView } from "@combine/ui/src/views/dashboard/dashboard-view";

export default function DashboardPage() {
	// Static data until API hooks are wired
	return (
		<DashboardView
			killSwitchActive={false}
			strategies={[]}
			recentEvents={[]}
			workers={[
				{ name: "candle-collector", status: "running" },
				{ name: "strategy-worker", status: "running" },
				{ name: "vector-worker", status: "running" },
				{ name: "label-worker", status: "running" },
				{ name: "alert-worker", status: "running" },
				{ name: "execution-worker", status: "inactive" },
			]}
		/>
	);
}
