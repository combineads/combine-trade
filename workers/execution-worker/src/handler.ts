import type { DecisionResult } from "@combine/core/decision";
import type { GateResult } from "@combine/core/risk";
import type { ExchangeOrder } from "@combine/exchange";
import type { ExecutionMode, OrderPayload } from "@combine/execution";
import { requiresOrder } from "@combine/execution";
import { createLogger } from "@combine/shared";

const logger = createLogger("execution-worker-handler");

export interface ExecutionWorkerDeps {
	loadExecutionMode: (strategyId: string) => Promise<ExecutionMode>;
	isOrderExists: (clientOrderId: string) => Promise<boolean>;
	validateRiskGate: (strategyId: string) => Promise<GateResult>;
	buildAndSaveOrder: (
		eventId: string,
		strategyId: string,
		decision: DecisionResult,
	) => Promise<OrderPayload>;
	submitOrder: (payload: OrderPayload) => Promise<ExchangeOrder>;
	saveOrderResult: (
		clientOrderId: string,
		status: "submitted" | "rejected",
		exchangeOrder?: ExchangeOrder,
		error?: string,
	) => Promise<void>;
}

export class ExecutionWorkerHandler {
	constructor(private readonly deps: ExecutionWorkerDeps) {}

	async handle(eventId: string, strategyId: string, result: DecisionResult): Promise<void> {
		// Skip PASS decisions
		if (result.decision === "PASS") {
			return;
		}

		// Check execution mode
		const mode = await this.deps.loadExecutionMode(strategyId);
		if (!requiresOrder(mode)) {
			return;
		}

		// Deduplication: check if order already exists for this event
		const clientOrderId = `ct-${strategyId}-${eventId}-0`;
		if (await this.deps.isOrderExists(clientOrderId)) {
			logger.warn({ eventId, clientOrderId }, "Order already exists, skipping");
			return;
		}

		// Risk gate validation
		const gateResult = await this.deps.validateRiskGate(strategyId);
		if (!gateResult.allowed) {
			logger.warn({ eventId, rejections: gateResult.rejections }, "Risk gate rejected order");
			return;
		}

		// Build and save order (planned status)
		let payload: OrderPayload;
		try {
			payload = await this.deps.buildAndSaveOrder(eventId, strategyId, result);
		} catch (err) {
			logger.error({ eventId, error: (err as Error).message }, "Failed to build order");
			return;
		}

		// Submit to exchange
		try {
			const exchangeOrder = await this.deps.submitOrder(payload);
			await this.deps.saveOrderResult(payload.clientOrderId, "submitted", exchangeOrder);
			logger.info({ eventId, exchangeOrderId: exchangeOrder.id }, "Order submitted");
		} catch (err) {
			await this.deps.saveOrderResult(
				payload.clientOrderId,
				"rejected",
				undefined,
				(err as Error).message,
			);
			logger.error({ eventId, error: (err as Error).message }, "Order submission failed");
		}
	}
}
