import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import { StrategyCreateView } from "../src/views/strategies/strategy-create-view";

describe("StrategyCreateView", () => {
	test("renders strategy name input", () => {
		const html = renderToString(<StrategyCreateView />);
		expect(html).toContain("Strategy name");
	});

	test("renders direction buttons", () => {
		const html = renderToString(<StrategyCreateView />);
		expect(html).toContain("LONG");
		expect(html).toContain("SHORT");
		expect(html).toContain("BOTH");
	});

	test("renders symbols input", () => {
		const html = renderToString(<StrategyCreateView />);
		expect(html).toContain("Symbols");
	});

	test("renders timeframe checkboxes", () => {
		const html = renderToString(<StrategyCreateView />);
		for (const tf of ["1m", "3m", "5m", "15m", "1h", "4h", "1d"]) {
			expect(html).toContain(tf);
		}
	});

	test("renders submit and cancel buttons", () => {
		const html = renderToString(<StrategyCreateView />);
		expect(html).toContain("Create Strategy");
		expect(html).toContain("Cancel");
	});

	test("disables submit when isSubmitting", () => {
		const html = renderToString(<StrategyCreateView isSubmitting />);
		expect(html).toContain("disabled");
	});
});
