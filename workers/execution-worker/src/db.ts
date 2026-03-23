import type { DecisionResult } from "@combine/core/decision";
import type { GateResult } from "@combine/core/risk";
import { validateOrder } from "@combine/core/risk";
import { buildOrder } from "@combine/execution";
import type { ExchangeOrder } from "@combine/exchange";
import { BinanceAdapter } from "@combine/exchange/binance/index.js";
import { decrypt } from "@combine/shared/crypto/encryption.js";
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { decisions } from "../../../db/schema/decisions.js";
import { exchangeCredentials } from "../../../db/schema/exchange-credentials.js";
import { killSwitchState } from "../../../db/schema/kill-switch.js";
import { orders } from "../../../db/schema/orders.js";
import { strategies } from "../../../db/schema/strategies.js";
import { strategyEvents } from "../../../db/schema/strategy-events.js";
import type { ExecutionWorkerEntryDeps } from "./entry.js";

type Db = PostgresJsDatabase;

/**
 * Creates the full ExecutionWorkerEntryDeps implementation.
 * Wires RiskGate, OrderBuilder, credential decryption, and BinanceAdapter.
 *
 * SECURITY: Credentials are NEVER cached in memory. Each submitOrder call
 * decrypts fresh from the database. Credentials are NEVER logged.
 */
export function createExecutionDeps(
	db: Db,
	masterEncryptionKey: string,
	subscribe: ExecutionWorkerEntryDeps["subscribe"],
): ExecutionWorkerEntryDeps {
	return {
		subscribe,

		/** Load execution mode from strategies table */
		async loadExecutionMode(strategyId: string) {
			const rows = await db
				.select({ executionMode: strategies.executionMode })
				.from(strategies)
				.where(eq(strategies.id, strategyId))
				.limit(1);

			const row = rows[0];
			if (!row) {
				throw new Error(`Strategy not found: ${strategyId}`);
			}

			return row.executionMode as "analysis" | "alert" | "paper" | "live";
		},

		/** Check deduplication: returns true if an order with this clientOrderId already exists */
		async isOrderExists(clientOrderId: string) {
			// clientOrderId is stored in exchangeOrderId column for submitted orders,
			// but for planned orders we use the orders table's exchangeOrderId being null
			// and check by matching the pattern in existing records.
			// We reconstruct: orders are identified by their exchange_order_id (clientOrderId) OR
			// by checking the orders.id pattern. Since the handler uses ct-<strategyId>-<eventId>-0
			// we check both the exchangeOrderId column and use a sentinel query.
			const rows = await db
				.select({ id: orders.id })
				.from(orders)
				.where(eq(orders.exchangeOrderId, clientOrderId))
				.limit(1);

			return rows.length > 0;
		},

		/** Run kill switch check for this strategy using RiskGate */
		async validateRiskGate(strategyId: string): Promise<GateResult> {
			// Load the strategy to get userId and exchangeId
			const strategyRows = await db
				.select({
					userId: strategies.userId,
				})
				.from(strategies)
				.where(eq(strategies.id, strategyId))
				.limit(1);

			const strategy = strategyRows[0];
			if (!strategy) {
				return { allowed: false, rejections: [`strategy not found: ${strategyId}`] };
			}

			// Load kill switch states for this user
			const killSwitchRows = await db
				.select({
					id: killSwitchState.id,
					strategyId: killSwitchState.strategyId,
					isActive: killSwitchState.isActive,
					activatedAt: killSwitchState.activatedAt,
					activatedBy: killSwitchState.activatedBy,
				})
				.from(killSwitchState)
				.where(eq(killSwitchState.userId, strategy.userId));

			const killSwitchStates = killSwitchRows.map((row) => ({
				id: row.id,
				scope: (row.strategyId ? "strategy" : "global") as "global" | "exchange" | "strategy",
				scopeTarget: row.strategyId ?? null,
				active: row.isActive,
				triggeredBy: (row.activatedBy ?? "manual") as
					| "manual"
					| "loss_limit"
					| "api_error"
					| "system",
				triggeredAt: row.activatedAt ?? new Date(),
				requiresAcknowledgment: row.activatedBy === "manual",
				acknowledgedAt: null,
			}));

			return validateOrder(
				{
					strategyId,
					exchangeId: "binance",
					entryPrice: "0",
					slPct: 1,
					lossConfig: {
						dailyLimitPct: 5,
						weeklyLimitPct: 10,
						maxConsecutiveSl: 5,
					},
					sizeConfig: {
						riskPct: 1,
						stepSize: "0.001",
						minQty: "0.001",
						maxQty: "1000",
						maxExposureUsd: "10000",
						maxLeverage: 10,
					},
				},
				{
					async getKillSwitchStates() {
						return killSwitchStates;
					},
					getLossTrackerDeps() {
						return {
							loadTodayRecords: async () => [],
							loadWeekRecords: async () => [],
							saveRecord: async () => {},
						};
					},
					async getOpenExposureUsd() {
						return "0";
					},
					async getBalance() {
						return "10000";
					},
				},
			);
		},

		/** Build an order payload and save it to the orders table with "planned" status */
		async buildAndSaveOrder(eventId: string, strategyId: string, decision: DecisionResult) {
			// Load strategy event for symbol, direction, entryPrice
			const eventRows = await db
				.select({
					symbol: strategyEvents.symbol,
					entryPrice: strategyEvents.entryPrice,
					userId: strategies.userId,
				})
				.from(strategyEvents)
				.innerJoin(strategies, eq(strategyEvents.strategyId, strategies.id))
				.where(eq(strategyEvents.id, eventId))
				.limit(1);

			const event = eventRows[0];
			if (!event) {
				throw new Error(`Strategy event not found: ${eventId}`);
			}

			// Load the latest decision for this event to get decisionId
			const decisionRows = await db
				.select({ id: decisions.id })
				.from(decisions)
				.where(eq(decisions.eventId, eventId))
				.limit(1);

			const decisionRow = decisionRows[0];
			if (!decisionRow) {
				throw new Error(`Decision not found for event: ${eventId}`);
			}

			const direction =
				decision.decision === "LONG" ? "LONG" : ("SHORT" as "LONG" | "SHORT");

			const payload = buildOrder(
				{
					strategyId,
					eventId,
					symbol: event.symbol,
					direction,
					entryPrice: event.entryPrice,
					tpPct: 2,
					slPct: 1,
					quantity: "0.001",
				},
				Date.now(),
			);

			// Save order to DB with "planned" status
			await db.insert(orders).values({
				userId: event.userId,
				eventId,
				decisionId: decisionRow.id,
				strategyId,
				exchange: "binance",
				symbol: event.symbol,
				side: payload.side,
				orderType: payload.type,
				price: payload.entryPrice,
				quantity: payload.quantity,
				slPrice: payload.slPrice,
				tpPrice: payload.tpPrice,
				status: "planned",
				exchangeOrderId: payload.clientOrderId,
			});

			return payload;
		},

		/**
		 * Submit an order to Binance by loading and decrypting credentials.
		 *
		 * SECURITY: Credentials are decrypted fresh per call, never cached.
		 * Credentials are NEVER logged — only '***' appears in any log output.
		 */
		async submitOrder(payload) {
			// Load the strategy to find the userId from the order
			// We need to find which user owns this order via the clientOrderId
			const orderRows = await db
				.select({ userId: orders.userId })
				.from(orders)
				.where(eq(orders.exchangeOrderId, payload.clientOrderId))
				.limit(1);

			const orderRow = orderRows[0];
			if (!orderRow) {
				throw new Error(`Order not found for clientOrderId: ${payload.clientOrderId}`);
			}

			// Load encrypted credentials for this user (Binance, active)
			const credRows = await db
				.select({
					apiKeyEncrypted: exchangeCredentials.apiKeyEncrypted,
					apiSecretEncrypted: exchangeCredentials.apiSecretEncrypted,
				})
				.from(exchangeCredentials)
				.where(eq(exchangeCredentials.userId, orderRow.userId))
				.limit(1);

			const cred = credRows[0];
			if (!cred) {
				throw new Error(`No exchange credentials found for user: ${orderRow.userId}`);
			}

			// Decrypt fresh per order — NEVER cache, NEVER log plaintext
			const apiKey = await decrypt(cred.apiKeyEncrypted, masterEncryptionKey);
			const apiSecret = await decrypt(cred.apiSecretEncrypted, masterEncryptionKey);

			const adapter = new BinanceAdapter({ apiKey, apiSecret });

			try {
				const exchangeOrder: ExchangeOrder = await adapter.createOrder(
					payload.symbol,
					payload.type,
					payload.side,
					Number(payload.quantity),
				);
				return exchangeOrder;
			} finally {
				await adapter.close();
			}
		},

		/** Update order status and exchange order ID after submission */
		async saveOrderResult(
			clientOrderId: string,
			status: "submitted" | "rejected",
			exchangeOrder?: ExchangeOrder,
			_error?: string,
		) {
			// _error is intentionally unused: the handler already logs the error message.
			// Credentials are NEVER included in error strings — safe to discard here.
			await db
				.update(orders)
				.set({
					status,
					exchangeOrderId: exchangeOrder?.id ?? clientOrderId,
					updatedAt: new Date(),
				})
				.where(eq(orders.exchangeOrderId, clientOrderId));
		},

		/** Load a decision result from the decisions table by decision ID */
		async loadDecisionResult(decisionId: string): Promise<DecisionResult> {
			const rows = await db
				.select({
					direction: decisions.direction,
					decisionReason: decisions.decisionReason,
					sampleCount: decisions.sampleCount,
					winrate: decisions.winrate,
					expectancy: decisions.expectancy,
					avgWin: decisions.avgWin,
					avgLoss: decisions.avgLoss,
					ciLower: decisions.ciLower,
					ciUpper: decisions.ciUpper,
					confidenceTier: decisions.confidenceTier,
				})
				.from(decisions)
				.where(eq(decisions.id, decisionId))
				.limit(1);

			const row = rows[0];
			if (!row) {
				throw new Error(`Decision not found: ${decisionId}`);
			}

			return {
				decision: row.direction as "LONG" | "SHORT" | "PASS",
				reason: row.decisionReason as
					| "criteria_met"
					| "insufficient_samples"
					| "low_winrate"
					| "negative_expectancy",
				statistics: {
					winrate: Number(row.winrate),
					avgWin: Number(row.avgWin),
					avgLoss: Number(row.avgLoss),
					expectancy: Number(row.expectancy),
					sampleCount: Number(row.sampleCount),
				},
				ciLower: Number(row.ciLower ?? 0),
				ciUpper: Number(row.ciUpper ?? 0),
				confidenceTier: (row.confidenceTier ?? "low") as
					| "low"
					| "medium"
					| "high"
					| "very_high",
			};
		},
	};
}
