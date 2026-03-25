/**
 * LLM Override Integration Test (T-16-020)
 *
 * Verifies the full pipeline path when a strategy has use_llm_filter=true
 * and the LLM returns PASS for a kNN LONG decision:
 *
 *   candle_closed → strategy_event → VectorEventHandler (kNN LONG)
 *     → decision_pending_llm → LlmDecisionWorker (PASS override)
 *       → decision_completed(PASS) → alert-worker: SKIPPED
 *                                  → execution-worker: SKIPPED
 *
 * DB assertions verify:
 *   - decisions.direction = 'LONG' (original kNN action preserved)
 *   - decisions.llm_action = 'PASS'
 *   - decisions.llm_reason populated
 *   - decisions.llm_confidence populated
 *   - decisions.llm_evaluated_at set
 *
 * Workers are called in-process for determinism.
 * LLM client is a deterministic stub — no real API calls.
 * Exchange and Slack are stubbed — no real external calls.
 *
 * Requires DATABASE_URL to be set; test is skipped otherwise.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { DecisionResult } from "@combine/core/decision";
import type { LlmDecision } from "@combine/core/macro/decision-prompt-builder.js";
import type { ExecutionMode } from "@combine/execution";
import type { DecisionPendingLlmPayload } from "@combine/shared/event-bus/channels.js";
import type { Channel, EventPublisher } from "@combine/shared/event-bus/types.js";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { authUser } from "../../../db/schema/better-auth.js";
import { decisions } from "../../../db/schema/decisions.js";
import { strategies } from "../../../db/schema/strategies.js";
import { strategyEvents } from "../../../db/schema/strategy-events.js";
import { AlertWorkerHandler } from "../../../workers/alert-worker/src/handler.js";
import { ExecutionWorkerHandler } from "../../../workers/execution-worker/src/handler.js";
import type { LlmDecisionRepository } from "../../../workers/llm-decision-worker/src/index.js";
import { LlmDecisionWorker } from "../../../workers/llm-decision-worker/src/index.js";
import type { VectorHandlerDeps } from "../../../workers/vector-worker/src/handler.js";
import { VectorEventHandler } from "../../../workers/vector-worker/src/handler.js";

// ---------------------------------------------------------------------------
// Skip if DATABASE_URL is not set
// ---------------------------------------------------------------------------
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
	console.info("Skipping llm-override integration tests: DATABASE_URL not set");
	process.exit(0);
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const SYMBOL = "BTCUSDT";
const TIMEFRAME = "15m"; // >= 15m — eligible for LLM routing

// ---------------------------------------------------------------------------
// In-memory publisher that records published events
// ---------------------------------------------------------------------------
interface PublishedEvent {
	channel: string;
	payload: unknown;
}

class InMemoryPublisher implements EventPublisher {
	readonly published: PublishedEvent[] = [];

	async publish<T>(channel: Channel<T>, payload: T): Promise<void> {
		this.published.push({ channel: channel.name, payload });
	}

	async close(): Promise<void> {}

	eventsFor(channelName: string): PublishedEvent[] {
		return this.published.filter((e) => e.channel === channelName);
	}
}

// ---------------------------------------------------------------------------
// Test state
// ---------------------------------------------------------------------------
let pool: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle>;
let testUserId: string;
let testStrategyId: string;
let testEventId: string;
let testDecisionId: string;

// Shared spy accumulators across tests
const alertNotifications: unknown[] = [];
const orderAttempts: unknown[] = [];

beforeAll(async () => {
	// DATABASE_URL is guaranteed non-null here (process.exit above)
	pool = postgres(DATABASE_URL as string, { max: 3 });
	db = drizzle(pool);

	// Create a test user (required for strategy FK)
	testUserId = `llm-override-test-user-${Date.now()}`;
	await db.insert(authUser).values({
		id: testUserId,
		name: "LLM Override Test User",
		email: `llm-override-${Date.now()}@test.local`,
		emailVerified: false,
	});

	// Create a strategy with use_llm_filter=true and timeframe=15m
	const strategyRows = await db
		.insert(strategies)
		.values({
			userId: testUserId,
			version: 1,
			name: "LLM-Override-Test-Strategy",
			description: "Integration test strategy for LLM override (T-16-020)",
			code: "// test strategy",
			symbols: [SYMBOL],
			timeframe: TIMEFRAME,
			direction: "long",
			featuresDefinition: [],
			normalizationConfig: {},
			searchConfig: { topK: 50, threshold: 0.3, minSamples: 30 },
			resultConfig: { tpMultiplier: 2.0, slMultiplier: 1.0, maxHoldBars: 60 },
			decisionConfig: { minWinrate: 0.55, minExpectancy: 0.001 },
			executionMode: "live", // set to live so execution-worker would act if PASS not respected
			status: "active",
			useLlmFilter: true,
		})
		.returning({ id: strategies.id });

	testStrategyId = strategyRows[0]?.id ?? "";

	// Create a strategy event
	const eventRows = await db
		.insert(strategyEvents)
		.values({
			strategyId: testStrategyId,
			strategyVersion: 1,
			exchange: "binance",
			symbol: SYMBOL,
			timeframe: TIMEFRAME,
			openTime: new Date("2024-01-15T10:00:00Z"),
			direction: "long",
			features: [{ name: "rsi", value: 65, normalization: { method: "percent" } }],
			entryPrice: "45000",
		})
		.returning({ id: strategyEvents.id });

	testEventId = eventRows[0]?.id ?? "";
}, 30_000);

afterAll(async () => {
	try {
		// Clean up in reverse FK order
		if (testDecisionId) {
			await db
				.delete(decisions)
				.where(eq(decisions.id, testDecisionId))
				.catch(() => {});
		}
		if (testEventId) {
			await db
				.delete(strategyEvents)
				.where(eq(strategyEvents.id, testEventId))
				.catch(() => {});
		}
		if (testStrategyId) {
			await db
				.delete(strategies)
				.where(eq(strategies.id, testStrategyId))
				.catch(() => {});
		}
		if (testUserId) {
			await db
				.delete(authUser)
				.where(eq(authUser.id, testUserId))
				.catch(() => {});
		}
	} finally {
		await pool.end();
	}
}, 30_000);

// ---------------------------------------------------------------------------
// Integration tests
// ---------------------------------------------------------------------------

describe("llm-override — full pipeline: kNN LONG overridden by LLM PASS", () => {
	test("vector-worker routes to decision_pending_llm when use_llm_filter=true + timeframe=15m", async () => {
		const publisher = new InMemoryPublisher();

		// Build VectorHandlerDeps with all deps mocked except saveDecision,
		// which writes to the real test DB so subsequent tests can query the row.
		const vectorDeps: VectorHandlerDeps = {
			loadEvent: async () => ({
				id: testEventId,
				strategyId: testStrategyId,
				strategyVersion: 1,
				symbol: SYMBOL,
				timeframe: TIMEFRAME,
				direction: "long",
				features: [{ name: "rsi", value: 65, normalization: { method: "percent" } }],
				entryPrice: "45000",
			}),
			loadStrategy: async () => ({
				id: testStrategyId,
				version: 1,
				direction: "long",
				decisionConfig: { minWinrate: 0.55, minExpectancy: 0.001 },
				useLlmFilter: true,
			}),
			normalizeFeatures: (features) => features.map((f) => f.value / 100),
			ensureTable: async () => `vectors_${testStrategyId}_v1`,
			storeVector: async () => {},
			// Return SUFFICIENT kNN results so judge produces LONG
			searchVectors: async () => ({
				status: "SUFFICIENT",
				results: Array.from({ length: 35 }, (_, i) => ({
					eventId: `mock-match-${i}`,
					distance: 0.05 + i * 0.005,
				})),
				threshold: 0.3,
				totalCandidates: 50,
				validCount: 35,
			}),
			// 25 wins, 10 losses → winrate ~0.71 → LONG decision
			loadLabels: async () =>
				Array.from({ length: 35 }, (_, i) => ({
					resultType: i < 25 ? ("WIN" as const) : ("LOSS" as const),
					pnlPct: i < 25 ? 1.5 : -0.8,
				})),
			saveDecision: async (decision) => {
				// Write to real DB so subsequent tests can query the row
				const rows = await db
					.insert(decisions)
					.values({
						eventId: testEventId,
						strategyId: testStrategyId,
						strategyVersion: "1",
						symbol: SYMBOL,
						direction: decision.direction as string,
						sampleCount: String(decision.sampleCount),
						winrate: String(decision.winrate),
						expectancy: String(decision.expectancy),
						avgWin: String(decision.avgWin),
						avgLoss: String(decision.avgLoss),
						ciLower: decision.ciLower != null ? String(decision.ciLower) : null,
						ciUpper: decision.ciUpper != null ? String(decision.ciUpper) : null,
						confidenceTier:
							decision.confidenceTier != null ? String(decision.confidenceTier) : null,
						similarityTop1Score: null,
						decisionReason: decision.reason as string,
						executionMode: "live",
					})
					.returning({ id: decisions.id });
				testDecisionId = rows[0]?.id ?? "";
				return testDecisionId;
			},
			publisher,
		};

		const vectorHandler = new VectorEventHandler(vectorDeps);
		await vectorHandler.handle({
			eventId: testEventId,
			strategyId: testStrategyId,
			symbol: SYMBOL,
			version: 1,
		});

		// Assert: decision_pending_llm published (not decision_completed)
		const pendingLlm = publisher.eventsFor("decision_pending_llm");
		const completed = publisher.eventsFor("decision_completed");

		expect(pendingLlm).toHaveLength(1);
		expect(completed).toHaveLength(0);

		const pendingPayload = pendingLlm[0]?.payload as DecisionPendingLlmPayload;
		expect(pendingPayload.decisionId).toBe(testDecisionId);
		expect(pendingPayload.strategyId).toBe(testStrategyId);

		// Assert: decision row in DB has original kNN action = 'LONG'
		const decisionRows = await db
			.select()
			.from(decisions)
			.where(eq(decisions.id, testDecisionId))
			.limit(1);

		expect(decisionRows).toHaveLength(1);
		const decision = decisionRows[0];
		expect(decision?.direction).toBe("LONG");
		// LLM columns must still be NULL at this point
		expect(decision?.llmAction).toBeNull();
		expect(decision?.llmEvaluatedAt).toBeNull();
	}, 30_000);

	test("llm-decision-worker: LLM stub returns PASS, writes llm_* columns, preserves kNN direction", async () => {
		expect(testDecisionId).toBeTruthy();

		// Spy: track publishDecisionCompleted calls
		const publishedCompletions: { decisionId: string; direction: string }[] = [];

		// Build LlmDecisionRepository with real DB writes for updateWithLlmResult
		const llmRepo: LlmDecisionRepository = {
			getKnnDecision: async () => ({
				id: testDecisionId,
				strategyId: testStrategyId,
				direction: "LONG",
				winrate: 0.71,
				expectancy: 0.42,
				sampleCount: 35,
				confidenceTier: "high",
				features: { rsi: 65 },
			}),
			getRecentTrades: async () => [],
			getMacroContext: async () => ({
				upcomingEvents: [],
				recentNews: [],
				highImpactNext24h: 0,
			}),
			updateWithLlmResult: async (decisionId, llmResult) => {
				// Write LLM columns to real DB
				await db
					.update(decisions)
					.set({
						llmAction: llmResult.action,
						llmReason: llmResult.reason,
						llmConfidence: llmResult.confidence,
						llmRiskFactors: llmResult.risk_factors,
						llmEvaluatedAt: new Date(),
					})
					.where(eq(decisions.id, decisionId));
			},
			publishDecisionCompleted: async (decisionId, direction) => {
				publishedCompletions.push({ decisionId, direction });
			},
		};

		// llmClientStub: deterministic PASS response — no real LLM API calls
		const llmClientStub = async (_prompt: string): Promise<LlmDecision> => ({
			action: "PASS",
			reason: "High geopolitical risk detected",
			confidence: 0.2,
			risk_factors: ["geopolitical_risk", "low_liquidity"],
		});

		const llmWorker = new LlmDecisionWorker({
			repository: llmRepo,
			evaluate: llmClientStub,
		});

		await llmWorker.processDecision(testDecisionId);

		// Assert: decision_completed published with direction='PASS'
		expect(publishedCompletions).toHaveLength(1);
		expect(publishedCompletions[0]?.direction).toBe("PASS");

		// Assert: DB row has llm_* columns populated
		const decisionRows = await db
			.select()
			.from(decisions)
			.where(eq(decisions.id, testDecisionId))
			.limit(1);

		expect(decisionRows).toHaveLength(1);
		const decision = decisionRows[0];

		// Original kNN action preserved in direction column
		expect(decision?.direction).toBe("LONG");

		// LLM columns populated
		expect(decision?.llmAction).toBe("PASS");
		expect(decision?.llmReason).toBe("High geopolitical risk detected");
		expect(decision?.llmConfidence).toBeCloseTo(0.2, 3);
		expect(decision?.llmRiskFactors).toEqual(["geopolitical_risk", "low_liquidity"]);
		expect(decision?.llmEvaluatedAt).not.toBeNull();
		expect(decision?.llmEvaluatedAt).toBeInstanceOf(Date);
	}, 30_000);

	test("alert-worker: does NOT emit alert notification when decision action=PASS", async () => {
		// alertWorkerSpy — tracks whether Slack webhook was called
		const alertWorkerSpy: unknown[] = [];

		const alertHandler = new AlertWorkerHandler({
			loadExecutionMode: async () => "live" as ExecutionMode,
			isAlertSent: async () => false,
			saveAlert: async () => {},
			sendSlackWebhook: async (msg) => {
				alertNotifications.push(msg);
				alertWorkerSpy.push(msg);
			},
			loadAlertContext: async () => ({
				strategyName: "LLM-Override-Test-Strategy",
				symbol: SYMBOL,
				timeframe: TIMEFRAME,
				entryPrice: "45000",
				tp: "",
				sl: "",
				topSimilarity: 0,
			}),
		});

		// Simulate decision_completed with PASS action (LLM override result)
		const passDecisionResult: DecisionResult = {
			decision: "PASS",
			reason: "LLM_OVERRIDE",
			statistics: {
				winrate: 0.71,
				avgWin: 1.5,
				avgLoss: -0.8,
				expectancy: 0.42,
				sampleCount: 35,
			},
			ciLower: 0.55,
			ciUpper: 0.87,
			confidenceTier: "high",
		};

		await alertHandler.handle(testEventId, passDecisionResult);

		// Assert: NO alert notification emitted
		expect(alertWorkerSpy).toHaveLength(0);
		expect(alertNotifications).toHaveLength(0);
	}, 10_000);

	test("execution-worker: does NOT place order when decision action=PASS", async () => {
		// executionWorkerSpy — tracks whether order placement was attempted
		const executionWorkerSpy: unknown[] = [];

		const executionHandler = new ExecutionWorkerHandler({
			loadExecutionMode: async () => "live" as ExecutionMode,
			isOrderExists: async () => false,
			validateRiskGate: async () => ({ allowed: true, rejections: [] }),
			buildAndSaveOrder: async (_eventId, _strategyId, _decision) => {
				throw new Error("buildAndSaveOrder must not be called for PASS decision");
			},
			submitOrder: async (payload) => {
				orderAttempts.push(payload);
				executionWorkerSpy.push(payload);
				throw new Error("submitOrder must not be called for PASS decision");
			},
			saveOrderResult: async () => {},
		});

		// Simulate decision_completed with PASS action (LLM override result)
		const passDecisionResult: DecisionResult = {
			decision: "PASS",
			reason: "LLM_OVERRIDE",
			statistics: {
				winrate: 0.71,
				avgWin: 1.5,
				avgLoss: -0.8,
				expectancy: 0.42,
				sampleCount: 35,
			},
			ciLower: 0.55,
			ciUpper: 0.87,
			confidenceTier: "high",
		};

		await executionHandler.handle(testEventId, testStrategyId, passDecisionResult);

		// Assert: NO order placement attempted
		expect(executionWorkerSpy).toHaveLength(0);
		expect(orderAttempts).toHaveLength(0);
	}, 10_000);

	test("full pipeline state: DB has kNN direction=LONG, llm_action=PASS, all LLM columns set", async () => {
		expect(testDecisionId).toBeTruthy();

		const decisionRows = await db
			.select()
			.from(decisions)
			.where(eq(decisions.id, testDecisionId))
			.limit(1);

		expect(decisionRows).toHaveLength(1);
		const d = decisionRows[0];

		// Original kNN action preserved
		expect(d?.direction).toBe("LONG");

		// LLM override stored in dedicated columns
		expect(d?.llmAction).toBe("PASS");
		expect(d?.llmReason).toBeTruthy();
		expect(typeof d?.llmReason).toBe("string");
		expect(d?.llmConfidence).not.toBeNull();
		expect(d?.llmConfidence).toBeGreaterThan(0);
		expect(d?.llmConfidence).toBeLessThanOrEqual(1);
		expect(d?.llmRiskFactors).not.toBeNull();
		expect(Array.isArray(d?.llmRiskFactors)).toBe(true);
		expect(d?.llmEvaluatedAt).not.toBeNull();
		expect(d?.llmEvaluatedAt).toBeInstanceOf(Date);

		// No alert was emitted, no order was placed
		expect(alertNotifications).toHaveLength(0);
		expect(orderAttempts).toHaveLength(0);
	}, 10_000);
});
