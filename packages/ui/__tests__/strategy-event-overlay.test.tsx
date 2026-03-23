import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import {
	type ChartStrategyEvent,
	StrategyEventOverlay,
	type StrategyEventOverlayProps,
} from "../src/views/charts/strategy-event-overlay";

describe("StrategyEventOverlay", () => {
	test("renders null (no DOM nodes)", () => {
		const ref = { current: null };
		const html = renderToString(<StrategyEventOverlay seriesRef={ref} events={[]} />);
		expect(html).toBe("");
	});

	test("renders without error when events is empty", () => {
		const ref = { current: null };
		expect(() =>
			renderToString(<StrategyEventOverlay seriesRef={ref} events={[]} />),
		).not.toThrow();
	});

	test("renders without error when seriesRef.current is null", () => {
		const ref = { current: null };
		const events: ChartStrategyEvent[] = [
			{
				id: "e1",
				time: 1700000000,
				direction: "LONG",
				entryPrice: 50000,
			},
		];
		expect(() =>
			renderToString(<StrategyEventOverlay seriesRef={ref} events={events} />),
		).not.toThrow();
	});

	test("exports types correctly", () => {
		const props: StrategyEventOverlayProps = {
			seriesRef: { current: null },
			events: [],
		};
		const event: ChartStrategyEvent = {
			id: "e1",
			time: 1700000000,
			direction: "SHORT",
			entryPrice: 50000,
			exitTime: 1700003600,
			exitReason: "WIN",
			exitPrice: 49000,
			tpPrice: 48000,
			slPrice: 51000,
		};
		expect(props).toBeDefined();
		expect(event).toBeDefined();
	});
});
