import type { DecisionResult } from "@combine/core/decision";
import type { AlertContext, SlackMessage } from "@combine/alert";
import type { ExecutionMode } from "@combine/execution";
import type { Subscription } from "@combine/shared";
import { AlertWorkerHandler } from "./handler.js";
import { createLogger } from "@combine/shared";

const logger = createLogger("alert-worker-entry");

export interface AlertWorkerEntryDeps {
	subscribe: (channel: string, handler: (payload: unknown) => void) => Subscription;
	loadExecutionMode: (strategyId?: string) => Promise<ExecutionMode>;
	isAlertSent: (eventId: string) => Promise<boolean>;
	saveAlert: (eventId: string, status: "sent" | "failed") => Promise<void>;
	sendSlackWebhook: (message: SlackMessage) => Promise<void>;
	loadAlertContext: (eventId: string) => Promise<AlertContext>;
	loadDecisionResult: (decisionId: string) => Promise<DecisionResult>;
}

export function createAlertWorkerEntryDeps(deps: AlertWorkerEntryDeps): AlertWorkerEntryDeps {
	return deps;
}

/**
 * Start the alert worker: subscribe to decision_completed events
 * and dispatch to AlertWorkerHandler.
 */
export function startAlertWorker(deps: AlertWorkerEntryDeps): Subscription {
	const handler = new AlertWorkerHandler({
		loadExecutionMode: deps.loadExecutionMode,
		isAlertSent: deps.isAlertSent,
		saveAlert: deps.saveAlert,
		sendSlackWebhook: deps.sendSlackWebhook,
		loadAlertContext: deps.loadAlertContext,
	});

	const subscription = deps.subscribe("decision_completed", async (payload: unknown) => {
		const event = payload as { strategyId: string; decisionId: string; direction: string };

		try {
			const result = await deps.loadDecisionResult(event.decisionId);
			await handler.handle(event.decisionId, result);
		} catch (err) {
			logger.error(
				{ decisionId: event.decisionId, error: (err as Error).message },
				"Alert worker failed to process event",
			);
		}
	});

	logger.info("Alert worker started — listening for decision_completed events");
	return subscription;
}
