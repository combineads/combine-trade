import { describe, expect, test } from "bun:test";
import { useDailyPnl, type UseDailyPnlResult } from "../src/hooks/use-daily-pnl.js";

describe("useDailyPnl", () => {
	test("returns correct initial shape", () => {
		const result = useDailyPnl();
		expect(result.points).toEqual([]);
		expect(result.totalPnl).toBe("0");
		expect(result.isLoading).toBe(true);
		expect(result.error).toBeNull();
	});

	test("totalPnl is a string (not number)", () => {
		const result = useDailyPnl();
		expect(typeof result.totalPnl).toBe("string");
	});
});
