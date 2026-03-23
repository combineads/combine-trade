import type { AlertContext, SlackMessage } from "@combine/alert";
import { formatAlertMessage } from "@combine/alert";
import type { DecisionResult } from "@combine/core/decision";
import type { ExecutionMode } from "@combine/execution";
import { isActionable } from "@combine/execution";
import { createLogger } from "@combine/shared";

const logger = createLogger("alert-worker-handler");

const MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 500;

export interface AlertWorkerDeps {
	loadExecutionMode: (strategyId?: string) => Promise<ExecutionMode>;
	isAlertSent: (eventId: string) => Promise<boolean>;
	saveAlert: (eventId: string, status: "sent" | "failed") => Promise<void>;
	sendSlackWebhook: (message: SlackMessage) => Promise<void>;
	loadAlertContext: (eventId: string) => Promise<AlertContext>;
}

export class AlertWorkerHandler {
	constructor(private readonly deps: AlertWorkerDeps) {}

	async handle(eventId: string, result: DecisionResult): Promise<void> {
		// Skip PASS decisions
		if (result.decision === "PASS") {
			return;
		}

		// Check execution mode
		const mode = await this.deps.loadExecutionMode();
		if (!isActionable(mode)) {
			return;
		}

		// Deduplication check
		if (await this.deps.isAlertSent(eventId)) {
			logger.warn({ eventId }, "Alert already sent, skipping");
			return;
		}

		// Format message
		const ctx = await this.deps.loadAlertContext(eventId);
		const message = formatAlertMessage(result, ctx);

		// Send with retry
		const sent = await this.sendWithRetry(message);

		// Save alert status
		await this.deps.saveAlert(eventId, sent ? "sent" : "failed");
	}

	private async sendWithRetry(message: SlackMessage): Promise<boolean> {
		for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
			try {
				await this.deps.sendSlackWebhook(message);
				return true;
			} catch (err) {
				logger.warn({ attempt, error: (err as Error).message }, "Slack webhook failed");
				if (attempt < MAX_RETRIES) {
					await sleep(BACKOFF_BASE_MS * 2 ** (attempt - 1));
				}
			}
		}
		logger.error("Slack webhook exhausted retries, marking as failed");
		return false;
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
