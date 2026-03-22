import { describe, expect, test } from "bun:test";
import { Container } from "../container.js";
import { Injectable } from "../decorators.js";
import { ServiceScope, createToken } from "../types.js";

interface Counter {
	count: number;
	increment(): void;
}

const CounterToken = createToken<Counter>("Counter");

function makeCounter(): Counter {
	return {
		count: 0,
		increment() {
			this.count++;
		},
	};
}

describe("Container", () => {
	test("register and resolve a service", async () => {
		const container = new Container();
		container.register(CounterToken, makeCounter);

		const counter = await container.resolve(CounterToken);
		expect(counter.count).toBe(0);
		counter.increment();
		expect(counter.count).toBe(1);
	});

	test("singleton returns same instance", async () => {
		const container = new Container();
		container.register(CounterToken, makeCounter, ServiceScope.Singleton);

		const a = await container.resolve(CounterToken);
		a.increment();
		const b = await container.resolve(CounterToken);
		expect(a).toBe(b);
		expect(b.count).toBe(1);
	});

	test("transient returns new instance each time", async () => {
		const container = new Container();
		container.register(CounterToken, makeCounter, ServiceScope.Transient);

		const a = await container.resolve(CounterToken);
		a.increment();
		const b = await container.resolve(CounterToken);
		expect(a).not.toBe(b);
		expect(b.count).toBe(0);
	});

	test("async factory resolves correctly", async () => {
		const AsyncToken = createToken<string>("Async");
		const container = new Container();
		container.register(AsyncToken, async () => {
			await new Promise((r) => setTimeout(r, 1));
			return "async-value";
		});

		const result = await container.resolve(AsyncToken);
		expect(result).toBe("async-value");
	});

	test("dispose cleans up singletons in reverse order", async () => {
		const disposed: string[] = [];

		const TokenA = createToken<{ dispose: () => void }>("A");
		const TokenB = createToken<{ dispose: () => void }>("B");
		const container = new Container();

		container.register(TokenA, () => ({
			dispose: () => disposed.push("A"),
		}));
		container.register(TokenB, () => ({
			dispose: () => disposed.push("B"),
		}));

		await container.resolve(TokenA);
		await container.resolve(TokenB);
		await container.dispose();

		expect(disposed).toEqual(["B", "A"]);
	});

	test("resolving unregistered token throws", async () => {
		const container = new Container();
		const Unknown = createToken<string>("Unknown");

		expect(container.resolve(Unknown)).rejects.toThrow("Service not registered");
	});

	test("has() checks registration", () => {
		const container = new Container();
		expect(container.has(CounterToken)).toBe(false);
		container.register(CounterToken, makeCounter);
		expect(container.has(CounterToken)).toBe(true);
	});

	test("@Injectable decorator registers class", async () => {
		const GreeterToken = createToken<Greeter>("Greeter");
		const container = new Container();

		@Injectable(container, GreeterToken)
		class Greeter {
			greet() {
				return "hello";
			}
		}

		const greeter = await container.resolve(GreeterToken);
		expect(greeter.greet()).toBe("hello");
	});
});
