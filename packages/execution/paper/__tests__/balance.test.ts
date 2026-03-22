import { describe, expect, test } from "bun:test";
import {
	applyEntry,
	applyExit,
	calculateMargin,
	calculateUnrealizedPnl,
	computePeriodSummary,
	createBalance,
	resetBalance,
} from "../balance.js";
import type { PaperBalance, PaperPosition } from "../types.js";

describe("Paper Balance Tracker", () => {
	test("createBalance: initial state", () => {
		const bal = createBalance("10000");
		expect(bal.available).toBe("10000");
		expect(bal.initial).toBe("10000");
		expect(bal.realizedPnl).toBe("0");
	});

	test("calculateMargin: notional / leverage", () => {
		// quantity=0.1, price=50000, leverage=10 → notional=5000, margin=500
		const margin = calculateMargin("0.1", "50000", 10);
		expect(margin).toBe("500");
	});

	test("applyEntry LONG: deducts margin from available", () => {
		const bal = createBalance("10000");
		const { balance, position } = applyEntry(bal, "LONG", "50000", "0.1", 10);
		expect(balance.available).toBe("9500"); // 10000 - 500
		expect(position.direction).toBe("LONG");
		expect(position.entryPrice).toBe("50000");
		expect(position.quantity).toBe("0.1");
		expect(position.margin).toBe("500");
	});

	test("applyEntry SHORT: deducts margin from available", () => {
		const bal = createBalance("10000");
		const { balance } = applyEntry(bal, "SHORT", "50000", "0.1", 10);
		expect(balance.available).toBe("9500");
	});

	test("applyExit LONG win: adds PnL to balance, returns margin", () => {
		const bal: PaperBalance = { available: "9500", initial: "10000", realizedPnl: "0" };
		const pos: PaperPosition = {
			direction: "LONG",
			entryPrice: "50000",
			quantity: "0.1",
			margin: "500",
			leverage: 10,
		};
		// Exit at 51000 → PnL = 0.1 * (51000 - 50000) = 100
		const result = applyExit(bal, pos, "51000");
		expect(result.balance.available).toBe("10100"); // 9500 + 500 (margin) + 100 (pnl)
		expect(result.balance.realizedPnl).toBe("100");
		expect(result.pnl).toBe("100");
	});

	test("applyExit LONG loss: deducts loss from balance", () => {
		const bal: PaperBalance = { available: "9500", initial: "10000", realizedPnl: "0" };
		const pos: PaperPosition = {
			direction: "LONG",
			entryPrice: "50000",
			quantity: "0.1",
			margin: "500",
			leverage: 10,
		};
		// Exit at 49000 → PnL = 0.1 * (49000 - 50000) = -100
		const result = applyExit(bal, pos, "49000");
		expect(result.balance.available).toBe("9900"); // 9500 + 500 - 100
		expect(result.balance.realizedPnl).toBe("-100");
		expect(result.pnl).toBe("-100");
	});

	test("applyExit SHORT win: profit when price drops", () => {
		const bal: PaperBalance = { available: "9500", initial: "10000", realizedPnl: "0" };
		const pos: PaperPosition = {
			direction: "SHORT",
			entryPrice: "50000",
			quantity: "0.1",
			margin: "500",
			leverage: 10,
		};
		// Exit at 49000 → PnL = 0.1 * (50000 - 49000) = 100
		const result = applyExit(bal, pos, "49000");
		expect(result.balance.available).toBe("10100");
		expect(result.pnl).toBe("100");
	});

	test("applyExit SHORT loss: loss when price rises", () => {
		const bal: PaperBalance = { available: "9500", initial: "10000", realizedPnl: "0" };
		const pos: PaperPosition = {
			direction: "SHORT",
			entryPrice: "50000",
			quantity: "0.1",
			margin: "500",
			leverage: 10,
		};
		const result = applyExit(bal, pos, "51000");
		expect(result.balance.available).toBe("9900");
		expect(result.pnl).toBe("-100");
	});

	test("calculateUnrealizedPnl LONG: price above entry", () => {
		const pos: PaperPosition = {
			direction: "LONG",
			entryPrice: "50000",
			quantity: "0.1",
			margin: "500",
			leverage: 10,
		};
		const pnl = calculateUnrealizedPnl(pos, "52000");
		expect(pnl).toBe("200"); // 0.1 * (52000 - 50000)
	});

	test("calculateUnrealizedPnl SHORT: price below entry", () => {
		const pos: PaperPosition = {
			direction: "SHORT",
			entryPrice: "50000",
			quantity: "0.1",
			margin: "500",
			leverage: 10,
		};
		const pnl = calculateUnrealizedPnl(pos, "48000");
		expect(pnl).toBe("200"); // 0.1 * (50000 - 48000)
	});

	test("resetBalance: returns to initial", () => {
		const bal: PaperBalance = { available: "8500", initial: "10000", realizedPnl: "-1500" };
		const reset = resetBalance(bal);
		expect(reset.available).toBe("10000");
		expect(reset.initial).toBe("10000");
		expect(reset.realizedPnl).toBe("0");
	});

	test("computePeriodSummary: aggregates trades", () => {
		const pnls = ["100", "-50", "200", "-30", "150"];
		const summary = computePeriodSummary(pnls);
		expect(summary.totalPnl).toBe("370");
		expect(summary.winCount).toBe(3);
		expect(summary.lossCount).toBe(2);
		expect(summary.tradeCount).toBe(5);
		expect(summary.winRate).toBe(0.6);
	});

	test("computePeriodSummary: empty trades", () => {
		const summary = computePeriodSummary([]);
		expect(summary.totalPnl).toBe("0");
		expect(summary.winCount).toBe(0);
		expect(summary.tradeCount).toBe(0);
		expect(summary.winRate).toBe(0);
	});
});
