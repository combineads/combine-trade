import type { DecisionResult } from "@combine/core/decision";
import type { ExecutionMode, OrderPayload } from "@combine/execution";
import type { ExchangeOrder } from "@combine/exchange";
import type { GateResult } from "@combine/core/risk";
import type { Subscription } from "@combine/shared";
import { ExecutionWorkerHandler } from "./handler.js";
import { createLogger } from "@combine/shared";

const logger = createLogger("execution-worker-entry");

export interface ExecutionWorkerEntryDeps {
	subscribe: (channel: string, handler: (payload: unknown) => void) => Subscription;
	loadExecutionMode: (strategyId: string) => Promise<ExecutionMode>;
	isOrderExists: (clientOrderId: string) => Promise<boolean>;
	validateRiskGate: (strategyId: string) => Promise<GateResult>;
	buildAndSaveOrder: (eventId: string, strategyId: string, decision: DecisionResult) => Promise<OrderPayload>;
	submitOrder: (payload: OrderPayload) => Promise<ExchangeOrder>;
	saveOrderResult: (clientOrderId: string, status: "submitted" | "rejected", exchangeOrder?: ExchangeOrder, error?: string) => Promise<void>;
	loadDecisionResult: (decisionId: string) => Promise<DecisionResult>;
}

/**
 * Start the execution worker: subscribe to decision_completed events
 * and dispatch to ExecutionWorkerHandler.
 */
export function startExecutionWorker(deps: ExecutionWorkerEntryDeps): Subscription {
	const handler = new ExecutionWorkerHandler({
		loadExecutionMode: deps.loadExecutionMode,
		isOrderExists: deps.isOrderExists,
		validateRiskGate: deps.validateRiskGate,
		buildAndSaveOrder: deps.buildAndSaveOrder,
		submitOrder: deps.submitOrder,
		saveOrderResult: deps.saveOrderResult,
	});

	const subscription = deps.subscribe("decision_completed", async (payload: unknown) => {
		const event = payload as { strategyId: string; decisionId: string; direction: string };

		try {
			const result = await deps.loadDecisionResult(event.decisionId);
			await handler.handle(event.decisionId, event.strategyId, result);
		} catch (err) {
			logger.error(
				{ decisionId: event.decisionId, error: (err as Error).message },
				"Execution worker failed to process event",
			);
		}
	});

	logger.info("Execution worker started — listening for decision_completed events");
	return subscription;
}
