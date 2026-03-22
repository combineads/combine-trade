import { describe, expect, test, mock } from "bun:test";
import {
	hashLockKey,
	withAdvisoryLock,
	type AdvisoryLockDeps,
} from "../advisory-lock.js";

function makeDeps(overrides: Partial<AdvisoryLockDeps> = {}): AdvisoryLockDeps {
	return {
		acquireLock: mock(() => Promise.resolve(true)),
		releaseLock: mock(() => Promise.resolve()),
		...overrides,
	};
}

describe("hashLockKey", () => {
	test("produces a BigInt from symbol + direction", () => {
		const key = hashLockKey("BTCUSDT", "long");
		expect(typeof key).toBe("bigint");
	});

	test("same inputs produce same key", () => {
		const k1 = hashLockKey("BTCUSDT", "long");
		const k2 = hashLockKey("BTCUSDT", "long");
		expect(k1).toBe(k2);
	});

	test("different symbols produce different keys", () => {
		const k1 = hashLockKey("BTCUSDT", "long");
		const k2 = hashLockKey("ETHUSDT", "long");
		expect(k1).not.toBe(k2);
	});

	test("different directions produce different keys", () => {
		const k1 = hashLockKey("BTCUSDT", "long");
		const k2 = hashLockKey("BTCUSDT", "short");
		expect(k1).not.toBe(k2);
	});
});

describe("withAdvisoryLock", () => {
	test("acquires lock, runs fn, releases lock", async () => {
		const callOrder: string[] = [];
		const deps = makeDeps({
			acquireLock: mock(() => {
				callOrder.push("acquire");
				return Promise.resolve(true);
			}),
			releaseLock: mock(() => {
				callOrder.push("release");
				return Promise.resolve();
			}),
		});

		const result = await withAdvisoryLock(deps, 123n, async () => {
			callOrder.push("fn");
			return "result";
		});

		expect(result).toBe("result");
		expect(callOrder).toEqual(["acquire", "fn", "release"]);
	});

	test("releases lock even on error", async () => {
		const deps = makeDeps();

		await expect(
			withAdvisoryLock(deps, 123n, async () => {
				throw new Error("boom");
			}),
		).rejects.toThrow("boom");

		expect(deps.releaseLock).toHaveBeenCalledTimes(1);
	});

	test("throws when lock not acquired (timeout)", async () => {
		const deps = makeDeps({
			acquireLock: mock(() => Promise.resolve(false)),
		});

		await expect(
			withAdvisoryLock(deps, 123n, async () => "should not run"),
		).rejects.toThrow("lock");

		expect(deps.releaseLock).not.toHaveBeenCalled();
	});

	test("passes lock key to acquireLock", async () => {
		const deps = makeDeps();
		const key = hashLockKey("BTCUSDT", "long");

		await withAdvisoryLock(deps, key, async () => {});
		expect(deps.acquireLock).toHaveBeenCalledWith(key);
	});

	test("passes lock key to releaseLock", async () => {
		const deps = makeDeps();
		const key = 456n;

		await withAdvisoryLock(deps, key, async () => {});
		expect(deps.releaseLock).toHaveBeenCalledWith(key);
	});
});
