import { describe, expect, test } from "bun:test";
import type { DoubleBBResult } from "../detector.js";
import type { EvidenceResult } from "../evidence.js";
import { type GateContext, evaluateGate } from "../gate.js";

function makeEvidence(overrides: Partial<EvidenceResult> = {}): EvidenceResult {
	return {
		candlePattern: { hit: true, pattern: "hammer" },
		maEvidence: { hit: true, ordering: true, slope: "bullish" },
		separation: { hit: true, distance: 0.02 },
		h1Bias: { hit: true, bias: "aligned" },
		familyHitCount: 4,
		...overrides,
	};
}

function makeContext(overrides: Partial<GateContext> = {}): GateContext {
	return {
		direction: "both",
		...overrides,
	};
}

describe("evaluateGate", () => {
	test("passes when pattern + 4 evidence families + no direction conflict", () => {
		const pattern: DoubleBBResult = { variant: "breakout", side: "bullish" };
		const evidence = makeEvidence({ familyHitCount: 4 });
		const ctx = makeContext();

		const result = evaluateGate(pattern, evidence, ctx);

		expect(result.pass).toBe(true);
		expect(result.rejectReason).toBeUndefined();
	});

	test("rejects when no pattern detected", () => {
		const evidence = makeEvidence();
		const ctx = makeContext();

		const result = evaluateGate(null, evidence, ctx);

		expect(result.pass).toBe(false);
		expect(result.rejectReason).toBe("no_pattern");
	});

	test("rejects when evidence families < 3", () => {
		const pattern: DoubleBBResult = { variant: "trend_continuation", side: "bullish" };
		const evidence = makeEvidence({ familyHitCount: 2 });
		const ctx = makeContext();

		const result = evaluateGate(pattern, evidence, ctx);

		expect(result.pass).toBe(false);
		expect(result.rejectReason).toBe("weak_evidence");
	});

	test("rejects counter_trend bias", () => {
		const pattern: DoubleBBResult = { variant: "reversal", side: "bullish" };
		const evidence = makeEvidence({
			familyHitCount: 3,
			h1Bias: { hit: false, bias: "counter_trend" },
		});
		const ctx = makeContext();

		const result = evaluateGate(pattern, evidence, ctx);

		expect(result.pass).toBe(false);
		expect(result.rejectReason).toBe("counter_trend");
	});

	test("direction filter: LONG ignores bearish patterns", () => {
		const pattern: DoubleBBResult = { variant: "breakout", side: "bearish" };
		const evidence = makeEvidence({ familyHitCount: 4 });
		const ctx = makeContext({ direction: "long" });

		const result = evaluateGate(pattern, evidence, ctx);

		expect(result.pass).toBe(false);
		expect(result.rejectReason).toBe("direction_filter");
	});

	test("direction filter: SHORT ignores bullish patterns", () => {
		const pattern: DoubleBBResult = { variant: "trend_continuation", side: "bullish" };
		const evidence = makeEvidence({ familyHitCount: 3 });
		const ctx = makeContext({ direction: "short" });

		const result = evaluateGate(pattern, evidence, ctx);

		expect(result.pass).toBe(false);
		expect(result.rejectReason).toBe("direction_filter");
	});

	test("direction 'both' allows both bullish and bearish", () => {
		const bullishPattern: DoubleBBResult = { variant: "breakout", side: "bullish" };
		const bearishPattern: DoubleBBResult = { variant: "breakout", side: "bearish" };
		const evidence = makeEvidence({ familyHitCount: 3 });
		const ctx = makeContext({ direction: "both" });

		expect(evaluateGate(bullishPattern, evidence, ctx).pass).toBe(true);
		expect(evaluateGate(bearishPattern, evidence, ctx).pass).toBe(true);
	});

	test("passes with exactly 3 evidence families", () => {
		const pattern: DoubleBBResult = { variant: "reversal", side: "bearish" };
		const evidence = makeEvidence({
			familyHitCount: 3,
			h1Bias: { hit: false, bias: "neutral_bias" },
		});
		const ctx = makeContext();

		const result = evaluateGate(pattern, evidence, ctx);

		expect(result.pass).toBe(true);
	});
});
