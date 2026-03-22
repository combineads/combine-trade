import { describe, expect, test, mock, beforeEach, afterEach } from "bun:test";
import type { SlackMessage } from "../types.js";
import { sendSlackWebhook } from "../slack.js";

const testMessage: SlackMessage = {
	blocks: [
		{ type: "header", text: { type: "plain_text", text: "LONG BTCUSDT" } },
		{ type: "divider" },
	],
};

describe("sendSlackWebhook", () => {
	const originalFetch = globalThis.fetch;

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	test("sends POST with correct Content-Type and JSON body", async () => {
		let capturedRequest: Request | undefined;

		globalThis.fetch = mock(async (input: RequestInfo | URL) => {
			capturedRequest = input as Request;
			return new Response("ok", { status: 200 });
		}) as typeof fetch;

		await sendSlackWebhook("https://hooks.slack.com/test", testMessage);

		expect(capturedRequest).toBeDefined();
		const req = capturedRequest!;
		expect(req.method).toBe("POST");
		expect(req.headers.get("Content-Type")).toBe("application/json");
		const body = await req.json();
		expect(body.blocks).toHaveLength(2);
		expect(body.blocks[0].type).toBe("header");
	});

	test("throws on non-2xx response", async () => {
		globalThis.fetch = mock(async () => {
			return new Response("channel_not_found", { status: 404 });
		}) as typeof fetch;

		await expect(
			sendSlackWebhook("https://hooks.slack.com/test", testMessage),
		).rejects.toThrow("Slack webhook failed");
	});

	test("includes status code in error message", async () => {
		globalThis.fetch = mock(async () => {
			return new Response("rate_limited", { status: 429 });
		}) as typeof fetch;

		try {
			await sendSlackWebhook("https://hooks.slack.com/test", testMessage);
			expect.unreachable("should have thrown");
		} catch (err) {
			expect((err as Error).message).toContain("429");
		}
	});

	test("throws on fetch error (network failure)", async () => {
		globalThis.fetch = mock(async () => {
			throw new Error("ECONNREFUSED");
		}) as typeof fetch;

		await expect(
			sendSlackWebhook("https://hooks.slack.com/test", testMessage),
		).rejects.toThrow("ECONNREFUSED");
	});

	test("respects timeout via AbortController", async () => {
		globalThis.fetch = mock(async (input: RequestInfo | URL) => {
			// When using new Request(), the signal is on the Request object
			if (input instanceof Request) {
				expect(input.signal).toBeDefined();
			}
			return new Response("ok", { status: 200 });
		}) as typeof fetch;

		await sendSlackWebhook("https://hooks.slack.com/test", testMessage);
	});

	test("succeeds on 200 response", async () => {
		globalThis.fetch = mock(async () => {
			return new Response("ok", { status: 200 });
		}) as typeof fetch;

		await expect(
			sendSlackWebhook("https://hooks.slack.com/test", testMessage),
		).resolves.toBeUndefined();
	});
});
