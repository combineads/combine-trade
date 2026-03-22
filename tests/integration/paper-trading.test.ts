import { describe, expect, test } from "bun:test";
import Decimal from "decimal.js";
import {
	applyEntry,
	applyExit,
	calculateUnrealizedPnl,
	computePeriodSummary,
	createBalance,
} from "../../packages/execution/paper/balance.js";
import {
	maxDrawdown,
	sharpeRatio,
	zTestWinRate,
} from "../../packages/execution/paper/comparator.js";
import { scanForExit, simulateMarketFill } from "../../packages/execution/paper/matcher.js";
import {
	type ReadinessInput,
	calculateReadinessScore,
} from "../../packages/execution/paper/readiness.js";
import type { PaperCandle } from "../../packages/execution/paper/types.js";

describe("Paper Trading Integration", () => {
	test("A: full winning LONG trade lifecycle", () => {
		// 1. Entry fill
		const fill = simulateMarketFill("LONG", "50000");
		expect(fill.fillPrice).toBe("50025");

		// 2. Open position with balance
		const balance = createBalance("10000");
		const { balance: afterEntry, position } = applyEntry(
			balance,
			"LONG",
			fill.fillPrice,
			"0.1",
			10,
		);
		expect(Number(afterEntry.available)).toBeLessThan(10000);

		// 3. Scan candles for TP exit
		const candles: PaperCandle[] = [
			{ open: "50100", high: "50200", low: "49900", close: "50150" },
			{ open: "50150", high: "51100", low: "50000", close: "51000" }, // TP hit
		];
		const exit = scanForExit("LONG", fill.fillPrice, "49000", "51000", candles);
		expect(exit.reason).toBe("TP");
		expect(exit.exitBar).toBe(2);

		// 4. Close position
		const { balance: afterExit, pnl } = applyExit(afterEntry, position, exit.exitPrice);
		expect(Number(pnl)).toBeGreaterThan(0);
		expect(Number(afterExit.available)).toBeGreaterThan(10000);
	});

	test("B: full losing LONG trade lifecycle (SL hit)", () => {
		const fill = simulateMarketFill("LONG", "50000");
		const balance = createBalance("10000");
		const { balance: afterEntry, position } = applyEntry(
			balance,
			"LONG",
			fill.fillPrice,
			"0.1",
			10,
		);

		const candles: PaperCandle[] = [
			{ open: "50000", high: "50100", low: "49400", close: "49500" }, // SL hit
		];
		const exit = scanForExit("LONG", fill.fillPrice, "49500", "52000", candles);
		expect(exit.reason).toBe("SL");

		const { balance: afterExit, pnl } = applyExit(afterEntry, position, exit.exitPrice);
		expect(Number(pnl)).toBeLessThan(0);
		expect(Number(afterExit.available)).toBeLessThan(10000);
	});

	test("C: multi-trade session → period summary → comparator → readiness", () => {
		let balance = createBalance("10000");
		const tradeResults: string[] = [];
		const dailyReturns: string[] = [];
		const equityCurve: string[] = ["10000"];

		// Simulate 5 trades
		const trades = [
			{
				dir: "LONG" as const,
				open: "50000",
				sl: "49500",
				tp: "51000",
				exitHigh: "51100",
				exitLow: "49900",
			},
			{
				dir: "LONG" as const,
				open: "50000",
				sl: "49500",
				tp: "51000",
				exitHigh: "50200",
				exitLow: "49400",
			},
			{
				dir: "SHORT" as const,
				open: "50000",
				sl: "50500",
				tp: "49000",
				exitHigh: "50100",
				exitLow: "48900",
			},
			{
				dir: "LONG" as const,
				open: "50000",
				sl: "49500",
				tp: "51000",
				exitHigh: "51200",
				exitLow: "49800",
			},
			{
				dir: "LONG" as const,
				open: "50000",
				sl: "49500",
				tp: "51000",
				exitHigh: "51100",
				exitLow: "49900",
			},
		];

		for (const t of trades) {
			const fill = simulateMarketFill(t.dir, t.open, { slippagePct: 0 });
			const { balance: bAfterEntry, position } = applyEntry(
				balance,
				t.dir,
				fill.fillPrice,
				"0.1",
				10,
			);

			const candles: PaperCandle[] = [
				{ open: t.open, high: t.exitHigh, low: t.exitLow, close: t.open },
			];
			const exit = scanForExit(t.dir, fill.fillPrice, t.sl, t.tp, candles);
			const { balance: bAfterExit, pnl } = applyExit(bAfterEntry, position, exit.exitPrice);

			balance = bAfterExit;
			tradeResults.push(pnl);
			dailyReturns.push(new Decimal(pnl).div(10000).toString());
			equityCurve.push(balance.available);
		}

		// Period summary
		const summary = computePeriodSummary(tradeResults);
		expect(summary.tradeCount).toBe(5);
		expect(summary.winCount).toBeGreaterThan(0);
		expect(summary.lossCount).toBeGreaterThan(0);

		// Comparator stats
		const sharpe = sharpeRatio(dailyReturns);
		expect(typeof sharpe).toBe("string");

		const dd = maxDrawdown(equityCurve);
		expect(typeof dd).toBe("string");

		const zTest = zTestWinRate(summary.winRate, 0.65, summary.tradeCount);
		expect(typeof zTest.pass).toBe("boolean");

		// Readiness score
		const readiness = calculateReadinessScore({
			backtest: {
				tradeCount: 150,
				expectancy: 1.2,
				sharpeRatio: Number(sharpe),
				maxDrawdownPct: Number(dd),
			},
			paper: {
				durationDays: 14,
				tradeCount: summary.tradeCount,
				zTestPass: zTest.pass,
				lossLimitBreaches: 0,
			},
			risk: {
				dailyLossLimitConfigured: true,
				positionSizingConfigured: true,
				killSwitchTestedWithin24h: true,
				exchangeCredentialsValid: true,
			},
			manual: { riskAcknowledged: true, goLiveConfirmed: true },
			resetTriggered: false,
		});
		expect(readiness.total).toBeGreaterThan(0);
		expect(["LOCKED", "CAUTION", "READY"]).toContain(readiness.gate);
	});

	test("D: SHORT trade lifecycle", () => {
		const fill = simulateMarketFill("SHORT", "50000");
		expect(Number(fill.fillPrice)).toBeLessThan(50000);

		const balance = createBalance("10000");
		const { balance: afterEntry, position } = applyEntry(
			balance,
			"SHORT",
			fill.fillPrice,
			"0.1",
			10,
		);

		const candles: PaperCandle[] = [
			{ open: "49950", high: "50100", low: "48900", close: "49000" }, // TP hit for SHORT
		];
		const exit = scanForExit("SHORT", fill.fillPrice, "50500", "49000", candles);
		expect(exit.reason).toBe("TP");

		const { pnl } = applyExit(afterEntry, position, exit.exitPrice);
		expect(Number(pnl)).toBeGreaterThan(0);
	});

	test("E: readiness gate — sufficient data → READY vs insufficient → LOCKED", () => {
		const readyInput: ReadinessInput = {
			backtest: { tradeCount: 200, expectancy: 1.5, sharpeRatio: 1.8, maxDrawdownPct: 12 },
			paper: { durationDays: 14, tradeCount: 30, zTestPass: true, lossLimitBreaches: 0 },
			risk: {
				dailyLossLimitConfigured: true,
				positionSizingConfigured: true,
				killSwitchTestedWithin24h: true,
				exchangeCredentialsValid: true,
			},
			manual: { riskAcknowledged: true, goLiveConfirmed: true },
			resetTriggered: false,
		};
		expect(calculateReadinessScore(readyInput).gate).toBe("READY");

		const lockedInput: ReadinessInput = {
			backtest: { tradeCount: 10, expectancy: -0.5, sharpeRatio: 0.3, maxDrawdownPct: 30 },
			paper: { durationDays: 2, tradeCount: 3, zTestPass: false, lossLimitBreaches: 2 },
			risk: {
				dailyLossLimitConfigured: false,
				positionSizingConfigured: false,
				killSwitchTestedWithin24h: false,
				exchangeCredentialsValid: false,
			},
			manual: { riskAcknowledged: false, goLiveConfirmed: false },
			resetTriggered: false,
		};
		expect(calculateReadinessScore(lockedInput).gate).toBe("LOCKED");
	});

	test("F: unrealized PnL tracks current price", () => {
		const balance = createBalance("10000");
		const { position } = applyEntry(balance, "LONG", "50000", "0.1", 10);

		const pnlUp = calculateUnrealizedPnl(position, "52000");
		expect(pnlUp).toBe("200");

		const pnlDown = calculateUnrealizedPnl(position, "48000");
		expect(pnlDown).toBe("-200");
	});
});
