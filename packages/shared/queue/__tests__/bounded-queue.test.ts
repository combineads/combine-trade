import { describe, expect, mock, test } from "bun:test";
import { BoundedQueue } from "../index.js";

describe("BoundedQueue — basics", () => {
	test("starts empty", () => {
		const q = new BoundedQueue<number>({ maxSize: 5, overflow: "drop-oldest" });
		expect(q.size).toBe(0);
		expect(q.isEmpty).toBe(true);
		expect(q.isFull).toBe(false);
	});

	test("enqueue increases size", () => {
		const q = new BoundedQueue<number>({ maxSize: 5, overflow: "drop-oldest" });
		q.enqueue(1);
		q.enqueue(2);
		expect(q.size).toBe(2);
	});

	test("dequeue removes and returns front item (FIFO)", () => {
		const q = new BoundedQueue<number>({ maxSize: 5, overflow: "drop-oldest" });
		q.enqueue(10);
		q.enqueue(20);
		expect(q.dequeue()).toBe(10);
		expect(q.dequeue()).toBe(20);
	});

	test("dequeue on empty queue returns undefined", () => {
		const q = new BoundedQueue<number>({ maxSize: 5, overflow: "drop-oldest" });
		expect(q.dequeue()).toBeUndefined();
	});

	test("isFull becomes true at capacity", () => {
		const q = new BoundedQueue<number>({ maxSize: 3, overflow: "drop-oldest" });
		q.enqueue(1);
		q.enqueue(2);
		q.enqueue(3);
		expect(q.isFull).toBe(true);
	});
});

describe("BoundedQueue — drop-oldest overflow", () => {
	test("drops oldest item when full and new item arrives", () => {
		const q = new BoundedQueue<number>({ maxSize: 3, overflow: "drop-oldest" });
		q.enqueue(1);
		q.enqueue(2);
		q.enqueue(3);
		q.enqueue(4); // should drop 1
		expect(q.size).toBe(3);
		expect(q.dequeue()).toBe(2);
	});

	test("size stays at maxSize after many drop-oldest enqueues", () => {
		const q = new BoundedQueue<number>({ maxSize: 2, overflow: "drop-oldest" });
		for (let i = 0; i < 10; i++) q.enqueue(i);
		expect(q.size).toBe(2);
	});

	test("always keeps most recent items", () => {
		const q = new BoundedQueue<number>({ maxSize: 2, overflow: "drop-oldest" });
		q.enqueue(1);
		q.enqueue(2);
		q.enqueue(3); // drops 1
		expect(q.dequeue()).toBe(2);
		expect(q.dequeue()).toBe(3);
	});
});

describe("BoundedQueue — drop-newest overflow", () => {
	test("discards new item when full", () => {
		const q = new BoundedQueue<number>({ maxSize: 2, overflow: "drop-newest" });
		q.enqueue(1);
		q.enqueue(2);
		q.enqueue(3); // dropped
		expect(q.size).toBe(2);
		expect(q.dequeue()).toBe(1);
		expect(q.dequeue()).toBe(2);
	});

	test("size stays at maxSize after extra enqueues", () => {
		const q = new BoundedQueue<string>({ maxSize: 3, overflow: "drop-newest" });
		q.enqueue("a");
		q.enqueue("b");
		q.enqueue("c");
		q.enqueue("d");
		q.enqueue("e");
		expect(q.size).toBe(3);
	});
});

describe("BoundedQueue — block overflow", () => {
	test("enqueue resolves immediately when space available", async () => {
		const q = new BoundedQueue<number>({ maxSize: 5, overflow: "block" });
		const start = Date.now();
		await q.enqueue(1);
		expect(Date.now() - start).toBeLessThan(20);
	});

	test("enqueue waits for space when full, then resolves", async () => {
		const q = new BoundedQueue<number>({ maxSize: 2, overflow: "block" });
		await q.enqueue(1);
		await q.enqueue(2);

		// Full — enqueue should block until we dequeue
		let resolved = false;
		const p = q.enqueue(3).then(() => {
			resolved = true;
		});

		// Give it a moment — should not have resolved yet
		await new Promise((r) => setTimeout(r, 20));
		expect(resolved).toBe(false);

		// Dequeue to free space
		q.dequeue();
		await p;
		expect(resolved).toBe(true);
	});
});

describe("BoundedQueue — warning callback", () => {
	test("fires onWarning when queue reaches 80% capacity", () => {
		const warned = mock(() => {});
		const q = new BoundedQueue<number>({
			maxSize: 5,
			overflow: "drop-oldest",
			onWarning: warned,
		});
		// 4/5 = 80% — warning should fire
		q.enqueue(1);
		q.enqueue(2);
		q.enqueue(3);
		q.enqueue(4);
		expect(warned).toHaveBeenCalled();
	});

	test("does not fire warning below 80% capacity", () => {
		const warned = mock(() => {});
		const q = new BoundedQueue<number>({
			maxSize: 5,
			overflow: "drop-oldest",
			onWarning: warned,
		});
		// 3/5 = 60% — no warning
		q.enqueue(1);
		q.enqueue(2);
		q.enqueue(3);
		expect(warned).not.toHaveBeenCalled();
	});
});
