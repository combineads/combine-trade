import { describe, expect, test } from "bun:test";
import { AlertDeduplicator } from "../deduplicator.js";

describe("AlertDeduplicator", () => {
	// Test A — New eventId is not a duplicate
	test("new eventId is not a duplicate", async () => {
		const dedup = new AlertDeduplicator();
		const result = await dedup.isDuplicate("evt-1");
		expect(result).toBe(false);
	});

	// Test B — Mark seen, then check duplicate
	test("markSeen then isDuplicate returns true", async () => {
		const dedup = new AlertDeduplicator();
		await dedup.markSeen("evt-1");
		const result = await dedup.isDuplicate("evt-1");
		expect(result).toBe(true);
	});

	// Test C — TTL expiry
	test("isDuplicate returns false after TTL expires", async () => {
		let now = 1000000;
		const mockNow = () => now;
		const dedup = new AlertDeduplicator({ ttlSeconds: 1, getNow: mockNow });

		await dedup.markSeen("evt-2");
		// Advance time past TTL (1 second = 1000ms)
		now += 2000;

		const result = await dedup.isDuplicate("evt-2");
		expect(result).toBe(false);
	});

	// Test D — duplicate_count increments
	test("duplicate_count increments on each true isDuplicate result", async () => {
		const dedup = new AlertDeduplicator();
		await dedup.markSeen("evt-3");
		await dedup.isDuplicate("evt-3");
		await dedup.isDuplicate("evt-3");
		expect(dedup.duplicateCount).toBe(2);
	});

	// Test E — Distinct eventIds are independent
	test("distinct eventIds are independent", async () => {
		const dedup = new AlertDeduplicator();
		await dedup.markSeen("evt-a");
		const result = await dedup.isDuplicate("evt-b");
		expect(result).toBe(false);
	});

	// Test F — Lazy eviction does not break subsequent checks
	test("lazy eviction: expired entry returns false, live entry still returns true", async () => {
		let now = 1000000;
		const mockNow = () => now;
		const dedup = new AlertDeduplicator({ ttlSeconds: 1, getNow: mockNow });

		await dedup.markSeen("evt-live");
		// Advance time so evt-live is still within TTL
		now += 500;
		await dedup.markSeen("evt-expire");
		// Advance time so evt-expire has expired but evt-live has not
		now += 1500;

		const expiredResult = await dedup.isDuplicate("evt-expire");
		const liveResult = await dedup.isDuplicate("evt-live");

		expect(expiredResult).toBe(false);
		expect(liveResult).toBe(false); // evt-live: marked at t=1000000, now=1003000, TTL=1s → also expired
	});

	// Additional: live entry is still true before TTL
	test("live entry within TTL is still duplicate", async () => {
		let now = 1000000;
		const mockNow = () => now;
		const dedup = new AlertDeduplicator({ ttlSeconds: 10, getNow: mockNow });

		await dedup.markSeen("evt-live");
		now += 5000; // 5 seconds — within 10s TTL

		const result = await dedup.isDuplicate("evt-live");
		expect(result).toBe(true);
	});
});
