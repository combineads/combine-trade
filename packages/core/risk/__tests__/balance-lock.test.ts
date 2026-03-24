import { describe, expect, test } from "bun:test";
import { BalanceLock, BalanceLockError } from "../balance-lock.js";

describe("BalanceLock — available balance", () => {
	test("available equals totalBalance when nothing is locked", () => {
		const lock = new BalanceLock();
		expect(lock.available("1000")).toBe("1000");
	});

	test("available decreases after acquire", () => {
		const lock = new BalanceLock();
		lock.acquire("order-1", "200", "1000");
		expect(lock.available("1000")).toBe("800");
	});

	test("available decreases for each active lock", () => {
		const lock = new BalanceLock();
		lock.acquire("order-1", "200", "1000");
		lock.acquire("order-2", "300", "1000");
		expect(lock.available("1000")).toBe("500");
	});

	test("available returns totalBalance after all locks released", () => {
		const lock = new BalanceLock();
		lock.acquire("order-1", "200", "1000");
		lock.release("order-1");
		expect(lock.available("1000")).toBe("1000");
	});
});

describe("BalanceLock — acquire", () => {
	test("acquires lock and tracks locked amount", () => {
		const lock = new BalanceLock();
		lock.acquire("order-1", "150", "1000");
		expect(lock.lockedAmount("order-1")).toBe("150");
	});

	test("throws BalanceLockError when insufficient available balance", () => {
		const lock = new BalanceLock();
		lock.acquire("order-1", "800", "1000");
		expect(() => lock.acquire("order-2", "300", "1000")).toThrow(BalanceLockError);
	});

	test("throws when amount exceeds total balance", () => {
		const lock = new BalanceLock();
		expect(() => lock.acquire("order-1", "1500", "1000")).toThrow(BalanceLockError);
	});

	test("throws on duplicate lockId", () => {
		const lock = new BalanceLock();
		lock.acquire("order-1", "100", "1000");
		expect(() => lock.acquire("order-1", "50", "1000")).toThrow(BalanceLockError);
	});

	test("allows acquiring exactly the remaining balance", () => {
		const lock = new BalanceLock();
		lock.acquire("order-1", "600", "1000");
		expect(() => lock.acquire("order-2", "400", "1000")).not.toThrow();
		expect(lock.available("1000")).toBe("0");
	});
});

describe("BalanceLock — release", () => {
	test("release removes the lock", () => {
		const lock = new BalanceLock();
		lock.acquire("order-1", "200", "1000");
		lock.release("order-1");
		expect(lock.lockedAmount("order-1")).toBe("0");
	});

	test("release of unknown lockId is a no-op", () => {
		const lock = new BalanceLock();
		expect(() => lock.release("nonexistent")).not.toThrow();
	});

	test("after release new acquisition can use freed balance", () => {
		const lock = new BalanceLock();
		lock.acquire("order-1", "800", "1000");
		lock.release("order-1");
		expect(() => lock.acquire("order-2", "900", "1000")).not.toThrow();
	});
});

describe("BalanceLock — releaseAll", () => {
	test("releaseAll clears all locks", () => {
		const lock = new BalanceLock();
		lock.acquire("a", "100", "1000");
		lock.acquire("b", "200", "1000");
		lock.releaseAll();
		expect(lock.available("1000")).toBe("1000");
	});
});

describe("BalanceLock — concurrent ordering simulation", () => {
	test("two concurrent acquires from the same pool do not over-commit", () => {
		const lock = new BalanceLock();
		const total = "1000";

		lock.acquire("order-1", "600", total); // 400 left
		// order-2 tries 500 — should fail
		expect(() => lock.acquire("order-2", "500", total)).toThrow(BalanceLockError);

		// available is still 400
		expect(lock.available(total)).toBe("400");
	});

	test("sequential acquires within budget all succeed", () => {
		const lock = new BalanceLock();
		const total = "1000";

		lock.acquire("order-1", "300", total);
		lock.acquire("order-2", "300", total);
		lock.acquire("order-3", "300", total);

		expect(lock.available(total)).toBe("100");
	});
});
