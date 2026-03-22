import { describe, expect, test } from "bun:test";
import { type ReadinessInput, calculateReadinessScore } from "../readiness.js";

function makeFullInput(overrides: Partial<ReadinessInput> = {}): ReadinessInput {
	return {
		backtest: {
			tradeCount: 150,
			expectancy: 1.5,
			sharpeRatio: 1.5,
			maxDrawdownPct: 10,
		},
		paper: {
			durationDays: 14,
			tradeCount: 30,
			zTestPass: true,
			lossLimitBreaches: 0,
		},
		risk: {
			dailyLossLimitConfigured: true,
			positionSizingConfigured: true,
			killSwitchTestedWithin24h: true,
			exchangeCredentialsValid: true,
		},
		manual: {
			riskAcknowledged: true,
			goLiveConfirmed: true,
		},
		resetTriggered: false,
		...overrides,
	};
}

describe("Readiness Score Calculator", () => {
	test("perfect score: all criteria met → 100", () => {
		const result = calculateReadinessScore(makeFullInput());
		expect(result.total).toBe(100);
		expect(result.gate).toBe("READY");
	});

	test("zero score: nothing met → 0", () => {
		const result = calculateReadinessScore(
			makeFullInput({
				backtest: { tradeCount: 0, expectancy: -1, sharpeRatio: 0, maxDrawdownPct: 30 },
				paper: { durationDays: 0, tradeCount: 0, zTestPass: false, lossLimitBreaches: 3 },
				risk: {
					dailyLossLimitConfigured: false,
					positionSizingConfigured: false,
					killSwitchTestedWithin24h: false,
					exchangeCredentialsValid: false,
				},
				manual: { riskAcknowledged: false, goLiveConfirmed: false },
			}),
		);
		expect(result.total).toBe(0);
		expect(result.gate).toBe("LOCKED");
	});

	test("backtest category sub-scores", () => {
		const result = calculateReadinessScore(
			makeFullInput({
				backtest: { tradeCount: 150, expectancy: 1.5, sharpeRatio: 0.5, maxDrawdownPct: 25 },
			}),
		);
		// Sharpe < 1.0 → lose 10, drawdown > 20% → lose 5
		expect(result.breakdown.backtest).toBe(20); // 10 + 10 + 0 + 0
	});

	test("paper category sub-scores", () => {
		const result = calculateReadinessScore(
			makeFullInput({
				paper: { durationDays: 14, tradeCount: 30, zTestPass: false, lossLimitBreaches: 0 },
			}),
		);
		// z-test fail → lose 12 points
		expect(result.breakdown.paper).toBe(23); // 8 + 7 + 0 + 8
	});

	test("risk category sub-scores", () => {
		const result = calculateReadinessScore(
			makeFullInput({
				risk: {
					dailyLossLimitConfigured: true,
					positionSizingConfigured: false,
					killSwitchTestedWithin24h: true,
					exchangeCredentialsValid: false,
				},
			}),
		);
		expect(result.breakdown.risk).toBe(10); // 5 + 0 + 5 + 0
	});

	test("manual category sub-scores", () => {
		const result = calculateReadinessScore(
			makeFullInput({
				manual: { riskAcknowledged: true, goLiveConfirmed: false },
			}),
		);
		expect(result.breakdown.manual).toBe(5); // 5 + 0
	});

	test("gate: <70 → LOCKED", () => {
		const result = calculateReadinessScore(
			makeFullInput({
				backtest: { tradeCount: 0, expectancy: -1, sharpeRatio: 0, maxDrawdownPct: 30 },
				paper: { durationDays: 14, tradeCount: 30, zTestPass: true, lossLimitBreaches: 0 },
			}),
		);
		expect(result.total).toBeLessThan(70);
		expect(result.gate).toBe("LOCKED");
	});

	test("gate: 70-89 → CAUTION", () => {
		// Remove manual confirmation (10 points) → 90 → but we need 70-89
		const result = calculateReadinessScore(
			makeFullInput({
				manual: { riskAcknowledged: false, goLiveConfirmed: false },
				risk: {
					dailyLossLimitConfigured: true,
					positionSizingConfigured: true,
					killSwitchTestedWithin24h: false,
					exchangeCredentialsValid: false,
				},
			}),
		);
		// 35 + 35 + 10 + 0 = 80
		expect(result.total).toBeGreaterThanOrEqual(70);
		expect(result.total).toBeLessThan(90);
		expect(result.gate).toBe("CAUTION");
	});

	test("gate: ≥90 → READY", () => {
		const result = calculateReadinessScore(makeFullInput());
		expect(result.total).toBeGreaterThanOrEqual(90);
		expect(result.gate).toBe("READY");
	});

	test("reset: loss limit breach → score 0", () => {
		const result = calculateReadinessScore(makeFullInput({ resetTriggered: true }));
		expect(result.total).toBe(0);
		expect(result.gate).toBe("LOCKED");
		expect(result.resetReason).toBe("reset_triggered");
	});

	test("partial scores add up correctly", () => {
		const result = calculateReadinessScore(makeFullInput());
		const sum =
			result.breakdown.backtest +
			result.breakdown.paper +
			result.breakdown.risk +
			result.breakdown.manual;
		expect(sum).toBe(result.total);
	});

	test("paper auto-extend: trades < 10 after 7 days → recommend 14 days", () => {
		const result = calculateReadinessScore(
			makeFullInput({
				paper: { durationDays: 8, tradeCount: 5, zTestPass: true, lossLimitBreaches: 0 },
			}),
		);
		expect(result.recommendExtendDays).toBe(14);
	});

	test("no extension needed when trades >= 10", () => {
		const result = calculateReadinessScore(makeFullInput());
		expect(result.recommendExtendDays).toBeNull();
	});
});
