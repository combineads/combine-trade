import type { SlackMessage } from "./types.js";

const DEFAULT_TIMEOUT_MS = 5000;

/**
 * Send a Slack message via incoming webhook.
 * Uses native fetch with AbortController timeout.
 */
export async function sendSlackWebhook(
	webhookUrl: string,
	message: SlackMessage,
	timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<void> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);

	try {
		const response = await fetch(
			new Request(webhookUrl, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(message),
				signal: controller.signal,
			}),
		);

		if (!response.ok) {
			const body = await response.text().catch(() => "");
			throw new Error(`Slack webhook failed: ${response.status} ${body}`);
		}
	} finally {
		clearTimeout(timer);
	}
}
