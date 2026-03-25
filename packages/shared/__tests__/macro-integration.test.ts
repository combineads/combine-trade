/**
 * Macro pipeline integration test — M1-M6
 *
 * End-to-end test covering the full macro retrospective pipeline:
 *   economic_events + news_items  →  journal context enrichment
 *   → journal assembly (JournalEventHandler)
 *   → journal_ready notification (in-process)
 *   → retrospective report generation (RetrospectiveWorker + stub LLM)
 *
 * Uses in-memory repository implementations; no real database or LLM API calls.
 * Completes well within the 30-second time budget.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { TradeJournal } from "@combine/core/journal";
import { enrichWithMacroContext } from "@combine/core/macro/context-enricher.js";
import type { MacroContextRepository } from "@combine/core/macro/context-enricher.js";
import { generateMacroTags } from "@combine/core/macro/macro-tagger.js";
import type { RetrospectivePromptInput } from "@combine/core/macro/prompt-builder.js";
import type { MacroContext } from "@combine/core/macro/types.js";
import type { EconomicEvent, NewsItem } from "@combine/core/macro/types.js";
import {
	type EventBus,
	JournalEventHandler,
	type JournalStorage,
	type MacroContextProvider,
	type MacroTagProvider,
} from "../../../workers/journal-worker/src/journal-event-handler.js";
import {
	type RetrospectiveRepository,
	RetrospectiveWorker,
} from "../../../workers/retrospective-worker/src/index.js";
import {
	ENTRY_TIME,
	EXIT_TIME,
	STUB_RETROSPECTIVE_REPORT,
	sampleEconomicEvents,
	sampleLabelReadyEvent,
	sampleNewsItems,
} from "./fixtures/macro-pipeline.js";

// ---------------------------------------------------------------------------
// In-memory store
// ---------------------------------------------------------------------------

interface StoredJournal {
	journal: TradeJournal;
	retrospectiveReport: string | null;
	retrospectiveGeneratedAt: Date | null;
}

class InMemoryJournalStore implements JournalStorage, RetrospectiveRepository {
	private journals = new Map<string, StoredJournal>();
	readonly journalReadyNotifications: string[] = [];

	// JournalStorage
	async save(journal: TradeJournal): Promise<void> {
		this.journals.set(journal.id, {
			journal,
			retrospectiveReport: null,
			retrospectiveGeneratedAt: null,
		});
		// Simulate journal_ready NOTIFY
		this.journalReadyNotifications.push(journal.id);
	}

	// RetrospectiveRepository
	async getJournalWithContext(journalId: string): Promise<RetrospectivePromptInput | null> {
		const stored = this.journals.get(journalId);
		if (!stored) return null;

		const { journal } = stored;
		const macroContext: MacroContext = (journal.entryMacroContext as MacroContext | null) ?? {
			entryEvents: [],
			entryNews: [],
			exitEvents: [],
			exitNews: [],
		};

		return {
			strategyName: `strategy-${journal.strategyId}`,
			symbol: journal.symbol,
			direction: journal.direction,
			timeframe: journal.timeframe,
			entryPrice: Number(journal.entryPrice),
			exitPrice: Number(journal.exitPrice),
			pnlPercent: journal.pnlPct,
			result: journal.resultType,
			holdBars: journal.holdBars,
			winrate: 0.65,
			expectancy: 0.8,
			sampleCount: 50,
			confidenceTier: "high",
			features: {},
			mfePercent: journal.mfePct,
			maePercent: journal.maePct,
			macroContext,
		};
	}

	async saveReport(journalId: string, report: string): Promise<void> {
		const stored = this.journals.get(journalId);
		if (!stored) return;
		stored.retrospectiveReport = report;
		stored.retrospectiveGeneratedAt = new Date();
	}

	// Test helpers
	getJournal(journalId: string): StoredJournal | undefined {
		return this.journals.get(journalId);
	}

	getLatestJournalId(): string | undefined {
		const ids = [...this.journals.keys()];
		return ids[ids.length - 1];
	}
}

// ---------------------------------------------------------------------------
// In-memory macro context repository
// ---------------------------------------------------------------------------

function createInMemoryMacroRepo(
	events: EconomicEvent[],
	news: NewsItem[],
): MacroContextRepository {
	return {
		async findEventsInRange(from: Date, to: Date): Promise<EconomicEvent[]> {
			return events.filter(
				(e) => e.scheduledAt.getTime() >= from.getTime() && e.scheduledAt.getTime() <= to.getTime(),
			);
		},
		async findNewsInRange(from: Date, to: Date): Promise<NewsItem[]> {
			return news.filter(
				(n) => n.publishedAt.getTime() >= from.getTime() && n.publishedAt.getTime() <= to.getTime(),
			);
		},
	};
}

// ---------------------------------------------------------------------------
// In-process event bus (no-op: journal assembly is called directly in tests)
// ---------------------------------------------------------------------------

function createInProcessEventBus(): EventBus {
	return {
		subscribe(eventType: string, handler: (event: unknown) => Promise<void>) {
			void eventType;
			void handler;
			return { unsubscribe: () => {} };
		},
	};
}

// ---------------------------------------------------------------------------
// Shared provider factories
// ---------------------------------------------------------------------------

function buildMacroProviders(macroRepo: MacroContextRepository): {
	macroContextProvider: MacroContextProvider;
	macroTagProvider: MacroTagProvider;
} {
	const macroContextProvider: MacroContextProvider = {
		async enrich(entryTime: Date): Promise<MacroContext> {
			return enrichWithMacroContext(entryTime, EXIT_TIME, macroRepo);
		},
	};

	const macroTagProvider: MacroTagProvider = {
		generateTags(ctx: MacroContext): string[] {
			return generateMacroTags(ctx, ENTRY_TIME);
		},
	};

	return { macroContextProvider, macroTagProvider };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("macro-integration: M1-M6 end-to-end pipeline", () => {
	let store: InMemoryJournalStore;
	let macroRepo: MacroContextRepository;

	beforeEach(() => {
		store = new InMemoryJournalStore();
		macroRepo = createInMemoryMacroRepo(sampleEconomicEvents, sampleNewsItems);
	});

	afterEach(() => {
		// In-memory store — nothing to clean up
	});

	// -------------------------------------------------------------------------
	// Stage 1: Context enrichment (M3 — context-enricher)
	// -------------------------------------------------------------------------
	test("M3 — enrichWithMacroContext returns events and news within time windows", async () => {
		const ctx = await enrichWithMacroContext(ENTRY_TIME, EXIT_TIME, macroRepo);

		// FOMC and CPI are within ±2 hours of entry
		expect(ctx.entryEvents.length).toBeGreaterThanOrEqual(2);

		// news-001 and news-002 are within ±1 hour of entry
		expect(ctx.entryNews.length).toBeGreaterThanOrEqual(2);

		// news-003 is within ±30 min of exit
		expect(ctx.exitNews.length).toBeGreaterThanOrEqual(1);
	});

	// -------------------------------------------------------------------------
	// Stage 2: Tag generation (M4 — macro-tagger)
	// -------------------------------------------------------------------------
	test("M4 — generateMacroTags derives expected tags from context", async () => {
		const ctx = await enrichWithMacroContext(ENTRY_TIME, EXIT_TIME, macroRepo);
		const tags = generateMacroTags(ctx, ENTRY_TIME);

		// FOMC within 7 days → "fomc_week"
		expect(tags).toContain("fomc_week");
		// CPI on same day → "cpi_day"
		expect(tags).toContain("cpi_day");
		// ≥2 news at entry → "major_news_at_entry"
		expect(tags).toContain("major_news_at_entry");
		// news-003 contains "war" → "geopolitical_risk"
		expect(tags).toContain("geopolitical_risk");
	});

	// -------------------------------------------------------------------------
	// Stage 3: Journal assembly with macro enrichment (M5 — journal-worker)
	// -------------------------------------------------------------------------
	test("M5 — JournalEventHandler saves journal with non-null entryMacroContext", async () => {
		const { macroContextProvider, macroTagProvider } = buildMacroProviders(macroRepo);

		const handler = new JournalEventHandler(
			createInProcessEventBus(),
			store,
			undefined,
			macroContextProvider,
			macroTagProvider,
		);

		await handler.handleLabelReady(sampleLabelReadyEvent);

		const journalId = store.getLatestJournalId();
		expect(journalId).toBeDefined();
		if (!journalId) throw new Error("no journal saved");

		const stored = store.getJournal(journalId);
		expect(stored).toBeDefined();
		if (!stored) throw new Error("stored journal not found");

		// entryMacroContext must be non-null
		expect(stored.journal.entryMacroContext).not.toBeNull();
	});

	test("M5 — auto_tags includes macro-derived tags", async () => {
		const { macroContextProvider, macroTagProvider } = buildMacroProviders(macroRepo);

		const handler = new JournalEventHandler(
			createInProcessEventBus(),
			store,
			undefined,
			macroContextProvider,
			macroTagProvider,
		);

		await handler.handleLabelReady(sampleLabelReadyEvent);

		const journalId = store.getLatestJournalId();
		if (!journalId) throw new Error("no journal saved");

		const stored = store.getJournal(journalId);
		if (!stored) throw new Error("stored journal not found");

		const { autoTags } = stored.journal;
		expect(autoTags).toContain("fomc_week");
		expect(autoTags).toContain("cpi_day");
		expect(autoTags).toContain("major_news_at_entry");
		expect(autoTags).toContain("geopolitical_risk");
	});

	// -------------------------------------------------------------------------
	// Stage 4: journal_ready notification (M5 — event bus)
	// -------------------------------------------------------------------------
	test("M5 — journal_ready NOTIFY is emitted with the correct journal_id", async () => {
		const { macroContextProvider, macroTagProvider } = buildMacroProviders(macroRepo);

		const handler = new JournalEventHandler(
			createInProcessEventBus(),
			store,
			undefined,
			macroContextProvider,
			macroTagProvider,
		);

		await handler.handleLabelReady(sampleLabelReadyEvent);

		// Store tracks notifications in the save() call
		expect(store.journalReadyNotifications).toHaveLength(1);

		const journalId = store.getLatestJournalId();
		if (!journalId) throw new Error("no journal saved");

		expect(store.journalReadyNotifications).toContain(journalId);
	});

	// -------------------------------------------------------------------------
	// Stage 5: Retrospective report generation (M6 — retrospective-worker)
	// -------------------------------------------------------------------------
	test("M6 — RetrospectiveWorker generates non-empty retrospective_report", async () => {
		const { macroContextProvider, macroTagProvider } = buildMacroProviders(macroRepo);

		const handler = new JournalEventHandler(
			createInProcessEventBus(),
			store,
			undefined,
			macroContextProvider,
			macroTagProvider,
		);

		await handler.handleLabelReady(sampleLabelReadyEvent);

		const journalId = store.getLatestJournalId();
		if (!journalId) throw new Error("no journal saved");

		const worker = new RetrospectiveWorker({
			repository: store,
			spawn: async (_prompt: string) => STUB_RETROSPECTIVE_REPORT,
		});

		await worker.processJournal(journalId);

		const stored = store.getJournal(journalId);
		if (!stored) throw new Error("stored journal not found");

		expect(stored.retrospectiveReport).not.toBeNull();
		expect((stored.retrospectiveReport ?? "").trim().length).toBeGreaterThan(0);
		expect(stored.retrospectiveReport).toBe(STUB_RETROSPECTIVE_REPORT);
	});

	test("M6 — retrospective_generated_at is set after report generation", async () => {
		const { macroContextProvider, macroTagProvider } = buildMacroProviders(macroRepo);

		const handler = new JournalEventHandler(
			createInProcessEventBus(),
			store,
			undefined,
			macroContextProvider,
			macroTagProvider,
		);

		await handler.handleLabelReady(sampleLabelReadyEvent);

		const journalId = store.getLatestJournalId();
		if (!journalId) throw new Error("no journal saved");

		const worker = new RetrospectiveWorker({
			repository: store,
			spawn: async (_prompt: string) => STUB_RETROSPECTIVE_REPORT,
		});

		const before = new Date();
		await worker.processJournal(journalId);

		const stored = store.getJournal(journalId);
		if (!stored) throw new Error("stored journal not found");

		expect(stored.retrospectiveGeneratedAt).not.toBeNull();
		expect((stored.retrospectiveGeneratedAt ?? new Date(0)).getTime()).toBeGreaterThanOrEqual(
			before.getTime(),
		);
	});

	// -------------------------------------------------------------------------
	// Stage 6: Tags from macro context appear in final merged tag set
	// -------------------------------------------------------------------------
	test("final merged tag set includes all macro-derived tags after full pipeline run", async () => {
		const { macroContextProvider, macroTagProvider } = buildMacroProviders(macroRepo);

		const handler = new JournalEventHandler(
			createInProcessEventBus(),
			store,
			undefined,
			macroContextProvider,
			macroTagProvider,
		);

		await handler.handleLabelReady(sampleLabelReadyEvent);

		const journalId = store.getLatestJournalId();
		if (!journalId) throw new Error("no journal saved");

		const worker = new RetrospectiveWorker({
			repository: store,
			spawn: async (_prompt: string) => STUB_RETROSPECTIVE_REPORT,
		});

		await worker.processJournal(journalId);

		const stored = store.getJournal(journalId);
		if (!stored) throw new Error("stored journal not found");

		const finalTags = stored.journal.autoTags;

		// All expected macro tags must be present in the final merged set
		const expectedMacroTags = ["fomc_week", "cpi_day", "major_news_at_entry", "geopolitical_risk"];
		for (const tag of expectedMacroTags) {
			expect(finalTags).toContain(tag);
		}

		// No duplicate tags
		const uniqueTags = new Set(finalTags);
		expect(uniqueTags.size).toBe(finalTags.length);
	});

	// -------------------------------------------------------------------------
	// Stage 7: Full pipeline in a single test (complete M1-M6 flow)
	// -------------------------------------------------------------------------
	test("full M1-M6 pipeline: economic event → news → journal → retrospective", async () => {
		// M1/M2: economic events and news are seeded (sampleEconomicEvents, sampleNewsItems)

		const { macroContextProvider, macroTagProvider } = buildMacroProviders(macroRepo);

		// M5: journal assembly
		const handler = new JournalEventHandler(
			createInProcessEventBus(),
			store,
			undefined,
			macroContextProvider,
			macroTagProvider,
		);

		await handler.handleLabelReady(sampleLabelReadyEvent);

		// Verify journal_ready notification emitted
		expect(store.journalReadyNotifications).toHaveLength(1);
		const journalId = store.journalReadyNotifications[0];
		if (!journalId) throw new Error("journal_ready notification missing");

		// Verify journal has macro context
		const beforeRetro = store.getJournal(journalId);
		if (!beforeRetro) throw new Error("journal not found before retrospective");
		expect(beforeRetro.journal.entryMacroContext).not.toBeNull();
		expect(beforeRetro.journal.autoTags.length).toBeGreaterThan(0);

		// M6: retrospective worker with deterministic LLM stub
		const worker = new RetrospectiveWorker({
			repository: store,
			spawn: async (_prompt: string) => STUB_RETROSPECTIVE_REPORT,
		});

		await worker.processJournal(journalId);

		// Final assertions
		const final = store.getJournal(journalId);
		if (!final) throw new Error("journal not found after retrospective");

		// retrospective_report is non-empty
		expect(final.retrospectiveReport).not.toBeNull();
		expect((final.retrospectiveReport ?? "").trim().length).toBeGreaterThan(0);

		// retrospective_generated_at is set
		expect(final.retrospectiveGeneratedAt).not.toBeNull();
		expect(final.retrospectiveGeneratedAt).toBeInstanceOf(Date);

		// entryMacroContext non-null (simulated as object)
		const macroCtx = final.journal.entryMacroContext as MacroContext;
		expect(macroCtx).not.toBeNull();
		expect(Array.isArray(macroCtx.entryEvents)).toBe(true);
		expect(Array.isArray(macroCtx.entryNews)).toBe(true);

		// auto_tags includes macro-derived tags
		expect(final.journal.autoTags).toContain("fomc_week");
		expect(final.journal.autoTags).toContain("cpi_day");
		expect(final.journal.autoTags).toContain("major_news_at_entry");
		expect(final.journal.autoTags).toContain("geopolitical_risk");
	});
});
