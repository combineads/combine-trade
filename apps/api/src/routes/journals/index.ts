import { Elysia } from "elysia";
import { journalDetailRoute } from "./detail.js";
import { type DriftComparisonDeps, driftComparisonRoute } from "./drift.js";
import { journalListRoute } from "./list.js";
import { journalSearchRoute } from "./search.js";
import type {
	JournalDetailOptions,
	JournalDetailResult,
	JournalListOptions,
	JournalListResult,
	JournalSearchOptions,
} from "./types.js";

export type { JournalSide, JournalOutcome } from "./types.js";
export type { DriftComparisonDeps, DriftComparison } from "./drift.js";

/**
 * Dependency interface for journal v2 routes.
 * All methods receive userId to enforce per-user data isolation.
 */
export interface JournalV2RouteDeps {
	/**
	 * Return a paginated list of journals filtered by the given options.
	 * Must only return journals owned by options.userId.
	 */
	listJournals: (options: JournalListOptions) => Promise<JournalListResult<unknown>>;

	/**
	 * Return the full journal detail including entry snapshot.
	 * Must return null when the journal does not exist or belongs to a different user.
	 */
	getJournal: (
		options: JournalDetailOptions,
	) => Promise<JournalDetailResult<unknown, unknown> | null>;

	/**
	 * Full-text search across symbol, autoTags, and notes.
	 * Supports `tag:<value>` prefix for tag-only searches.
	 * Must only search within journals owned by options.userId.
	 */
	searchJournals: (options: JournalSearchOptions) => Promise<JournalListResult<unknown>>;
}

/**
 * Elysia plugin that mounts journal v2 routes.
 *
 * Routes registered:
 *   GET /api/v1/journals                      — paginated list with filters
 *   GET /api/v1/journals/search               — text search (registered before /:id to avoid conflict)
 *   GET /api/v1/journals/drift/:strategyId    — strategy drift comparison
 *   GET /api/v1/journals/:id                  — journal detail
 */
export function journalV2Routes(deps: JournalV2RouteDeps, driftDeps?: DriftComparisonDeps) {
	const app = new Elysia().use(journalListRoute(deps)).use(journalSearchRoute(deps));

	if (driftDeps) {
		app.use(driftComparisonRoute(driftDeps));
	}

	return app.use(journalDetailRoute(deps));
}
