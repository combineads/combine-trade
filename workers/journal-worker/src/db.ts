import type { TradeJournal } from "@combine/core/journal";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { tradeJournals } from "../../../db/schema/trade-journals.js";
import type { JournalStorage } from "./journal-event-handler.js";

type Db = PostgresJsDatabase;

/**
 * Drizzle-based JournalStorage implementation.
 * Maps TradeJournal domain model to the trade_journals table.
 */
export function createJournalStorage(db: Db): JournalStorage {
	return {
		async save(journal: TradeJournal): Promise<void> {
			await db.insert(tradeJournals).values({
				id: journal.id,
				// userId and orderId are required by the schema but not available in the event payload.
				// Use sentinel values — the journal worker creates a stub record;
				// full enrichment (user/order linkage) is done by a downstream reconciliation step.
				userId: "system",
				eventId: journal.eventId,
				orderId: "00000000-0000-0000-0000-000000000000",
				strategyId: journal.strategyId,
				symbol: journal.symbol,
				direction: journal.direction,
				entryPrice: journal.entryPrice,
				exitPrice: journal.exitPrice,
				quantity: "0",
				entryTime: journal.entryTime,
				exitTime: journal.exitTime,
				holdBars: journal.holdBars,
				mfePct: String(journal.mfePct),
				maePct: String(journal.maePct),
				exitMarketContext: journal.exitMarketContext ?? null,
				entryMacroContext: journal.entryMacroContext ?? null,
				autoTags: journal.autoTags,
			});
		},
	};
}
