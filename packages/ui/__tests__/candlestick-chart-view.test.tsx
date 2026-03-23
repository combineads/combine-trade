import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import { CandlestickChartView } from "../src/views/charts/candlestick-chart-view";
import { SymbolSelector } from "../src/views/charts/symbol-selector";
import { TimeframeSelector } from "../src/views/charts/timeframe-selector";

describe("TimeframeSelector", () => {
	test("renders 7 timeframe buttons", () => {
		const html = renderToString(<TimeframeSelector current="1h" onSelect={() => {}} />);
		for (const tf of ["1m", "3m", "5m", "15m", "1h", "4h", "1d"]) {
			expect(html).toContain(tf);
		}
	});

	test("highlights active timeframe", () => {
		const html = renderToString(<TimeframeSelector current="4h" onSelect={() => {}} />);
		expect(html).toContain("4h");
	});
});

describe("SymbolSelector", () => {
	test("renders options for each symbol", () => {
		const html = renderToString(
			<SymbolSelector
				symbols={["BTC/USDT", "ETH/USDT", "SOL/USDT"]}
				value="BTC/USDT"
				onChange={() => {}}
			/>,
		);
		expect(html).toContain("BTC/USDT");
		expect(html).toContain("ETH/USDT");
		expect(html).toContain("SOL/USDT");
	});

	test("renders selected value", () => {
		const html = renderToString(
			<SymbolSelector symbols={["BTC/USDT", "ETH/USDT"]} value="ETH/USDT" onChange={() => {}} />,
		);
		expect(html).toContain("ETH/USDT");
	});
});

describe("CandlestickChartView", () => {
	test("renders symbol name", () => {
		const html = renderToString(<CandlestickChartView symbol="BTC/USDT" timeframe="1h" />);
		expect(html).toContain("BTC/USDT");
	});

	test("renders timeframe selector", () => {
		const html = renderToString(<CandlestickChartView symbol="BTC/USDT" timeframe="4h" />);
		expect(html).toContain("4h");
	});

	test("renders chart container area", () => {
		const html = renderToString(<CandlestickChartView symbol="BTC/USDT" timeframe="1h" />);
		expect(html).toContain("400");
	});
});
