/**
 * Test fixtures for macro pipeline integration tests.
 *
 * Provides deterministic sample data for economic events, news items,
 * and a trade record to drive the M1-M6 pipeline.
 */

import type { EconomicEvent, NewsItem } from "@combine/core/macro/types.js";
import type { LabelReadyEvent } from "../../../workers/journal-worker/src/journal-event-handler.js";

/** Entry time: 2026-03-22T14:00:00Z (seconds since epoch) */
export const ENTRY_TIME_EPOCH = 1774188000; // 2026-03-22T14:00:00Z

/** Exit time: 2026-03-22T16:00:00Z (seconds since epoch) */
export const EXIT_TIME_EPOCH = 1774195200; // 2026-03-22T16:00:00Z

export const ENTRY_TIME = new Date(ENTRY_TIME_EPOCH * 1000);
export const EXIT_TIME = new Date(EXIT_TIME_EPOCH * 1000);

/**
 * Sample economic events — at least 2 as required by the task.
 *
 * Event 1: FOMC statement within ±2 hours of entry → triggers "fomc_week" tag.
 * Event 2: CPI release on the same day as entry → triggers "cpi_day" tag.
 */
export const sampleEconomicEvents: EconomicEvent[] = [
	{
		id: "evt-fomc-001",
		externalId: "ext-fomc-001",
		title: "★★★ FOMC Statement",
		eventName: "FOMC Statement",
		impact: "HIGH",
		scheduledAt: new Date("2026-03-22T14:30:00Z"), // within ±2h of ENTRY_TIME
		newsCollected: true,
		newsCollectedAt: new Date("2026-03-22T14:35:00Z"),
		createdAt: new Date("2026-03-22T00:00:00Z"),
	},
	{
		id: "evt-cpi-001",
		externalId: "ext-cpi-001",
		title: "★★ CPI m/m",
		eventName: "CPI m/m",
		impact: "MEDIUM",
		scheduledAt: new Date("2026-03-22T13:30:00Z"), // same day as entry, within ±2h
		newsCollected: false,
		newsCollectedAt: null,
		createdAt: new Date("2026-03-22T00:00:00Z"),
	},
];

/**
 * Sample news items — at least 3 as required by the task.
 *
 * Items 1-2: published within ±1 hour of entry → triggers "major_news_at_entry" tag (≥2).
 * Item 3: geopolitical keyword "war" → triggers "geopolitical_risk" tag.
 */
export const sampleNewsItems: NewsItem[] = [
	{
		id: "news-001",
		externalId: "ext-news-001",
		headline: "Fed holds rates steady at March meeting",
		source: "Reuters",
		publishedAt: new Date("2026-03-22T14:15:00Z"), // within ±1h of ENTRY_TIME
		tags: ["fed", "rates"],
		economicEventId: "evt-fomc-001",
		createdAt: new Date("2026-03-22T14:16:00Z"),
	},
	{
		id: "news-002",
		externalId: "ext-news-002",
		headline: "CPI data shows inflation slowing faster than expected",
		source: "Bloomberg",
		publishedAt: new Date("2026-03-22T13:40:00Z"), // within ±1h of ENTRY_TIME
		tags: ["inflation", "cpi"],
		economicEventId: "evt-cpi-001",
		createdAt: new Date("2026-03-22T13:41:00Z"),
	},
	{
		id: "news-003",
		externalId: "ext-news-003",
		headline: "Middle East war escalation raises oil prices",
		source: "FT",
		publishedAt: new Date("2026-03-22T15:45:00Z"), // within ±30min of EXIT_TIME
		tags: ["geopolitics", "oil"],
		economicEventId: null,
		createdAt: new Date("2026-03-22T15:46:00Z"),
	},
];

/**
 * Sample label_ready event that drives journal assembly.
 */
export const sampleLabelReadyEvent: LabelReadyEvent = {
	type: "label_ready",
	tradeId: "trade-macro-int-001",
	strategyId: "strat-btc-rsi-001",
	strategyVersion: 1,
	symbol: "BTCUSDT",
	direction: "LONG",
	entryTime: ENTRY_TIME_EPOCH,
	exitTime: EXIT_TIME_EPOCH,
	entryPrice: "68000",
	exitPrice: "69500",
	label: "WIN",
	entryVector: [0.1, 0.2, 0.3, 0.4, 0.5],
	exitVector: [0.6, 0.7, 0.8, 0.9, 1.0],
};

/**
 * Deterministic LLM stub response for retrospective generation.
 */
export const STUB_RETROSPECTIVE_REPORT =
	"[통합 테스트 회고] FOMC 발표 직전 LONG 진입. CPI 둔화 뉴스로 상승 모멘텀 확인. 지정학적 리스크에도 불구하고 목표가 도달. 진입 타이밍 적절, 청산 시점 개선 여지 있음.";
