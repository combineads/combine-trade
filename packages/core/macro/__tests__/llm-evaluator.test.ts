import { describe, expect, mock, test } from "bun:test";
import type { LlmDecision } from "../decision-prompt-builder.js";
import { type LlmSpawnRunner, evaluateWithLlm } from "../llm-evaluator.js";

function mockSpawn(output: string): LlmSpawnRunner {
	return mock(async () => output);
}

function failSpawn(error: Error): LlmSpawnRunner {
	return mock(async () => {
		throw error;
	});
}

const VALID_RESPONSE: LlmDecision = {
	action: "PASS",
	reason: "FOMC 발표 직전이라 리스크가 높습니다.",
	confidence: 0.85,
	risk_factors: ["fomc_imminent", "high_volatility"],
};

describe("evaluateWithLlm", () => {
	test("parses valid JSON response", async () => {
		const spawn = mockSpawn(JSON.stringify(VALID_RESPONSE));

		const result = await evaluateWithLlm("test prompt", spawn);

		expect(result.action).toBe("PASS");
		expect(result.reason).toBe("FOMC 발표 직전이라 리스크가 높습니다.");
		expect(result.confidence).toBe(0.85);
		expect(result.risk_factors).toEqual(["fomc_imminent", "high_volatility"]);
	});

	test("returns CONFIRM on invalid JSON", async () => {
		const spawn = mockSpawn("This is not JSON at all");

		const result = await evaluateWithLlm("test prompt", spawn);

		expect(result.action).toBe("CONFIRM");
	});

	test("returns CONFIRM on spawn failure", async () => {
		const spawn = failSpawn(new Error("claude not found"));

		const result = await evaluateWithLlm("test prompt", spawn);

		expect(result.action).toBe("CONFIRM");
	});

	test("returns CONFIRM on empty output", async () => {
		const spawn = mockSpawn("");

		const result = await evaluateWithLlm("test prompt", spawn);

		expect(result.action).toBe("CONFIRM");
	});

	test("extracts JSON from markdown code block", async () => {
		const output = `Here is my analysis:\n\`\`\`json\n${JSON.stringify(VALID_RESPONSE)}\n\`\`\``;
		const spawn = mockSpawn(output);

		const result = await evaluateWithLlm("test prompt", spawn);

		expect(result.action).toBe("PASS");
	});

	test("returns CONFIRM for REDUCE_SIZE with valid fields", async () => {
		const response: LlmDecision = {
			action: "REDUCE_SIZE",
			reason: "불확실성이 높지만 방향성은 유효합니다.",
			confidence: 0.55,
			risk_factors: ["uncertainty"],
		};
		const spawn = mockSpawn(JSON.stringify(response));

		const result = await evaluateWithLlm("test prompt", spawn);

		expect(result.action).toBe("REDUCE_SIZE");
		expect(result.confidence).toBe(0.55);
	});

	test("returns CONFIRM when action field is missing", async () => {
		const spawn = mockSpawn(JSON.stringify({ reason: "test", confidence: 0.5 }));

		const result = await evaluateWithLlm("test prompt", spawn);

		expect(result.action).toBe("CONFIRM");
	});

	test("returns CONFIRM when action is invalid value", async () => {
		const spawn = mockSpawn(JSON.stringify({ action: "BUY", reason: "test", confidence: 0.5 }));

		const result = await evaluateWithLlm("test prompt", spawn);

		expect(result.action).toBe("CONFIRM");
	});
});
