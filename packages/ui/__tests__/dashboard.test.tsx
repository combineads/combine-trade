import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import { KillSwitchCard } from "../src/views/dashboard/kill-switch-card";
import { StrategySummary } from "../src/views/dashboard/strategy-summary";
import { RecentEvents } from "../src/views/dashboard/recent-events";
import { WorkerStatus } from "../src/views/dashboard/worker-status";
import { DashboardView } from "../src/views/dashboard/dashboard-view";

describe("KillSwitchCard", () => {
	test("renders OFF state (normal)", () => {
		const html = renderToString(<KillSwitchCard active={false} />);
		expect(html).toContain("Trading Active");
		expect(html).toContain("#22C55E");
	});

	test("renders ON state (emergency)", () => {
		const html = renderToString(<KillSwitchCard active={true} reason="Manual activation" />);
		expect(html).toContain("ALL TRADING HALTED");
		expect(html).toContain("#EF4444");
	});

	test("shows activation reason when active", () => {
		const html = renderToString(<KillSwitchCard active={true} reason="Daily loss limit breached" />);
		expect(html).toContain("Daily loss limit breached");
	});
});

describe("StrategySummary", () => {
	test("renders strategy cards", () => {
		const strategies = [
			{ id: "s1", name: "Momentum v3", status: "active" as const, winrate: 0.65, eventCount: 142 },
			{ id: "s2", name: "Mean Reversion", status: "draft" as const, winrate: 0, eventCount: 0 },
		];
		const html = renderToString(<StrategySummary strategies={strategies} />);
		expect(html).toContain("Momentum v3");
		expect(html).toContain("Mean Reversion");
		expect(html).toContain("65.0");
	});

	test("renders empty state", () => {
		const html = renderToString(<StrategySummary strategies={[]} />);
		expect(html).toContain("No strategies");
	});
});

describe("RecentEvents", () => {
	test("renders event list", () => {
		const events = [
			{ id: "e1", symbol: "BTCUSDT", direction: "LONG" as const, strategyName: "Momentum", createdAt: "2026-03-22T10:00:00Z" },
		];
		const html = renderToString(<RecentEvents events={events} />);
		expect(html).toContain("BTCUSDT");
		expect(html).toContain("LONG");
	});

	test("renders empty state", () => {
		const html = renderToString(<RecentEvents events={[]} />);
		expect(html).toContain("No events");
	});
});

describe("WorkerStatus", () => {
	test("renders worker status dots", () => {
		const workers = [
			{ name: "candle-collector", status: "running" as const },
			{ name: "strategy-worker", status: "running" as const },
			{ name: "execution-worker", status: "down" as const },
		];
		const html = renderToString(<WorkerStatus workers={workers} />);
		expect(html).toContain("candle-collector");
		expect(html).toContain("execution-worker");
		expect(html).toContain("#22C55E"); // running = green
		expect(html).toContain("#EF4444"); // down = red
	});
});

describe("DashboardView", () => {
	test("renders all sections", () => {
		const html = renderToString(
			<DashboardView
				killSwitchActive={false}
				strategies={[]}
				recentEvents={[]}
				workers={[]}
			/>,
		);
		expect(html).toContain("Dashboard");
		expect(html).toContain("KILL SWITCH");
		expect(html).toContain("Strategies");
		expect(html).toContain("Recent Events");
		expect(html).toContain("Workers");
	});
});
