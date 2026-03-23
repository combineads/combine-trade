import { describe, expect, test } from "bun:test";
import { type DeadLetterDeps, handleFailure, shouldRetry } from "../dead-letter.js";

function makeDeps(retryCount = 0): DeadLetterDeps & { saved: Array<Record<string, unknown>> } {
	const saved: Array<Record<string, unknown>> = [];
	return {
		saved,
		loadRetryCount: async () => retryCount,
		saveDeadLetter: async (entry) => {
			saved.push(entry);
		},
	};
}

describe("shouldRetry", () => {
	test("count 0 → true", () => expect(shouldRetry(0)).toBe(true));
	test("count 1 → true", () => expect(shouldRetry(1)).toBe(true));
	test("count 2 → true", () => expect(shouldRetry(2)).toBe(true));
	test("count 3 → false", () => expect(shouldRetry(3)).toBe(false));
	test("count 4 → false", () => expect(shouldRetry(4)).toBe(false));
});

describe("handleFailure", () => {
	test("retryCount < 3 → returns retry action", async () => {
		const deps = makeDeps(1);
		const result = await handleFailure("evt-1", "vector", new Error("timeout"), deps);
		expect(result.action).toBe("retry");
		expect(deps.saved).toHaveLength(0);
	});

	test("retryCount >= 3 → saves to dead-letter and returns dead_letter action", async () => {
		const deps = makeDeps(3);
		const result = await handleFailure("evt-1", "vector", new Error("timeout"), deps);
		expect(result.action).toBe("dead_letter");
		expect(deps.saved).toHaveLength(1);
		expect(deps.saved[0]!.eventId).toBe("evt-1");
		expect(deps.saved[0]!.stage).toBe("vector");
		expect(deps.saved[0]!.error).toBe("timeout");
	});

	test("loadRetryCount is called exactly once", async () => {
		let callCount = 0;
		const deps: DeadLetterDeps = {
			loadRetryCount: async () => {
				callCount++;
				return 0;
			},
			saveDeadLetter: async () => {},
		};
		await handleFailure("evt-1", "vector", new Error("fail"), deps);
		expect(callCount).toBe(1);
	});

	test("saveDeadLetter error propagates", async () => {
		const deps: DeadLetterDeps = {
			loadRetryCount: async () => 3,
			saveDeadLetter: async () => {
				throw new Error("DB write failed");
			},
		};
		expect(handleFailure("evt-1", "vector", new Error("fail"), deps)).rejects.toThrow(
			"DB write failed",
		);
	});
});
