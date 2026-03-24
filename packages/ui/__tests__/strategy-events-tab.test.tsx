import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import { type StrategyEvent, StrategyEventsTab } from "../src/views/strategies/strategy-events-tab";

describe("StrategyEventsTab", () => {
	const events: StrategyEvent[] = [
		{
			id: "e1",
			direction: "LONG",
			outcome: "WIN",
			symbol: "BTC/USDT",
			entryPrice: 65000,
			exitPrice: 66500,
			pnl: 1500,
			timestamp: 1711152000000,
		},
		{
			id: "e2",
			direction: "SHORT",
			outcome: "LOSS",
			symbol: "ETH/USDT",
			entryPrice: 3200,
			exitPrice: 3300,
			pnl: -100,
			timestamp: 1711155600000,
		},
	];

	test("renders event directions", () => {
		const html = renderToString(<StrategyEventsTab events={events} />);
		expect(html).toContain("LONG");
		expect(html).toContain("SHORT");
	});

	test("renders event symbols", () => {
		const html = renderToString(<StrategyEventsTab events={events} />);
		expect(html).toContain("BTC/USDT");
		expect(html).toContain("ETH/USDT");
	});

	test("renders outcomes", () => {
		const html = renderToString(<StrategyEventsTab events={events} />);
		expect(html).toContain("WIN");
		expect(html).toContain("LOSS");
	});

	test("renders empty state", () => {
		const html = renderToString(<StrategyEventsTab events={[]} locale="en" />);
		expect(html).toContain("No events yet");
	});

	test("renders loading state", () => {
		const html = renderToString(<StrategyEventsTab events={[]} loading locale="en" />);
		expect(html).toContain("Loading");
	});

	test("renders prices", () => {
		const html = renderToString(<StrategyEventsTab events={events} />);
		expect(html).toContain("65,000");
		expect(html).toContain("66,500");
	});
});
