import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import { BacktestPage } from "../src/views/backtest/backtest-page";

describe("BacktestPage", () => {
	test("renders Korean heading", () => {
		const html = renderToString(<BacktestPage strategies={[]} />);
		expect(html).toContain("백테스트");
	});

	test("renders strategy selector", () => {
		const html = renderToString(<BacktestPage strategies={[{ id: "s1", name: "Momentum v3" }]} />);
		expect(html).toContain("Momentum v3");
	});

	test("renders Korean date labels", () => {
		const html = renderToString(<BacktestPage strategies={[]} />);
		expect(html).toContain("시작");
		expect(html).toContain("종료");
	});

	test("renders Korean run button", () => {
		const html = renderToString(<BacktestPage strategies={[]} />);
		expect(html).toContain("백테스트 실행");
	});

	test("renders Korean empty results message", () => {
		const html = renderToString(<BacktestPage strategies={[]} />);
		expect(html).toContain("백테스트를 실행하여 결과를 확인하세요");
	});

	test("renders error message", () => {
		const html = renderToString(<BacktestPage strategies={[]} error="Connection failed" />);
		expect(html).toContain("Connection failed");
	});

	test("renders results when provided", () => {
		const html = renderToString(
			<BacktestPage
				strategies={[]}
				result={{
					stats: {
						totalTrades: 100,
						winrate: 0.55,
						expectancy: 0.3,
						profitFactor: 1.5,
						maxDrawdown: 8.2,
						sharpeRatio: 1.1,
						avgHoldBars: 20,
					},
					equityCurve: [{ index: 0, equity: 10000 }],
					pnlDistribution: [{ range: "0% to 1%", count: 10 }],
				}}
			/>,
		);
		expect(html).toContain("100");
		// winrate 0.55 = 55% via Intl formatPercent
		expect(html).toContain("55%");
	});
});
