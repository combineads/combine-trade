import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import { type ExecutionMode, ModeSelector } from "../src/views/strategies/mode-selector";
import { StrategyCard } from "../src/views/strategies/strategy-card";
import {
	type StrategyListItem,
	StrategyListView,
} from "../src/views/strategies/strategy-list-view";

describe("StrategyCard", () => {
	const strategy: StrategyListItem = {
		id: "s1",
		name: "Momentum v3",
		status: "active",
		mode: "alert",
		version: 3,
		symbols: ["BTCUSDT", "ETHUSDT"],
		direction: "long",
		winrate: 0.65,
		eventCount: 142,
		createdAt: "2026-01-15",
	};

	test("renders strategy name and version", () => {
		const html = renderToString(<StrategyCard strategy={strategy} />);
		expect(html).toContain("Momentum v3");
		expect(html).toContain("v3");
	});

	test("renders symbols", () => {
		const html = renderToString(<StrategyCard strategy={strategy} />);
		expect(html).toContain("BTCUSDT");
		expect(html).toContain("ETHUSDT");
	});

	test("renders winrate", () => {
		const html = renderToString(<StrategyCard strategy={strategy} />);
		expect(html).toContain("65.0");
	});

	test("renders status badge", () => {
		const html = renderToString(<StrategyCard strategy={strategy} />);
		expect(html).toContain("active");
	});

	test("renders mode label", () => {
		const html = renderToString(<StrategyCard strategy={strategy} />);
		expect(html).toContain("alert");
	});
});

describe("ModeSelector", () => {
	test("renders all mode options (en labels)", () => {
		const html = renderToString(<ModeSelector currentMode="analysis" onModeChange={() => {}} locale="en" />);
		expect(html).toContain("Analysis");
		expect(html).toContain("Alert");
		expect(html).toContain("Paper Trade");
		expect(html).toContain("Auto Trade");
	});

	test("highlights current mode", () => {
		const html = renderToString(<ModeSelector currentMode="alert" onModeChange={() => {}} locale="en" />);
		// The active mode should have primary color
		expect(html).toContain("#22C55E");
	});
});

describe("StrategyListView", () => {
	test("renders strategy cards", () => {
		const strategies: StrategyListItem[] = [
			{
				id: "s1",
				name: "Momentum",
				status: "active",
				mode: "alert",
				version: 1,
				symbols: ["BTCUSDT"],
				direction: "long",
				winrate: 0.6,
				eventCount: 100,
				createdAt: "2026-01-01",
			},
		];
		const html = renderToString(<StrategyListView strategies={strategies} locale="en" />);
		expect(html).toContain("Momentum");
		expect(html).toContain("Strategies");
	});

	test("renders empty state", () => {
		const html = renderToString(<StrategyListView strategies={[]} locale="en" />);
		expect(html).toContain("No strategies");
		expect(html).toContain("Create Strategy");
	});

	test("renders create button", () => {
		const html = renderToString(<StrategyListView strategies={[]} locale="en" />);
		expect(html).toContain("Create Strategy");
	});
});
