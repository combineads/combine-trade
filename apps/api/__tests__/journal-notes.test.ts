import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import { errorHandlerPlugin } from "../src/lib/errors.js";
import {
	type JournalNoteTagDeps,
	journalNoteTagRoutes,
} from "../src/routes/journals/notes-tags.js";
import { TEST_USER_ID, withMockUserId } from "./helpers/auth.js";

const OTHER_USER_ID = "user-other-999";

const sampleJournal = {
	id: "j-1",
	userId: TEST_USER_ID,
	strategyId: "strat-1",
	symbol: "BTCUSDT",
	direction: "long" as const,
	entryPrice: "50000",
	exitPrice: "52000",
	notes: null as string | null,
	tags: [] as string[],
	createdAt: new Date("2026-01-15").toISOString(),
	updatedAt: new Date("2026-01-15").toISOString(),
};

function createMockStore() {
	const journals = [{ ...sampleJournal }];

	const deps: JournalNoteTagDeps = {
		setNote: async (id, note, userId) => {
			const j = journals.find((j) => j.id === id);
			if (!j || j.userId !== userId) return null;
			j.notes = note;
			j.updatedAt = new Date().toISOString();
			return { ...j };
		},
		addTag: async (id, tag, userId) => {
			const j = journals.find((j) => j.id === id);
			if (!j || j.userId !== userId) return null;
			if (!j.tags.includes(tag)) j.tags = [...j.tags, tag];
			return [...j.tags];
		},
		removeTag: async (id, tag, userId) => {
			const j = journals.find((j) => j.id === id);
			if (!j || j.userId !== userId) return null;
			j.tags = j.tags.filter((t) => t !== tag);
			return [...j.tags];
		},
		listTags: async (userId) => {
			const allTags = journals.filter((j) => j.userId === userId).flatMap((j) => j.tags);
			return [...new Set(allTags)].sort();
		},
		getTagCount: async (id, userId) => {
			const j = journals.find((j) => j.id === id);
			if (!j || j.userId !== userId) return null;
			return j.tags.length;
		},
	};

	return { journals, deps };
}

function createApp(deps?: JournalNoteTagDeps, userId: string = TEST_USER_ID) {
	const { deps: mockDeps } = createMockStore();
	return new Elysia()
		.use(errorHandlerPlugin)
		.use(withMockUserId(userId))
		.use(journalNoteTagRoutes(deps ?? mockDeps));
}

const BASE = "http://localhost/api/v1";

// ---------------------------------------------------------------------------
// PATCH /journals/:id/notes
// ---------------------------------------------------------------------------

describe("PATCH /journals/:id/notes", () => {
	test("updates note on own journal entry", async () => {
		const { deps } = createMockStore();
		const app = createApp(deps);
		const res = await app.handle(
			new Request(`${BASE}/journals/j-1/notes`, {
				method: "PATCH",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ note: "My observation about this trade" }),
			}),
		);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data.notes).toBe("My observation about this trade");
	});

	test("replaces existing note (upsert semantics)", async () => {
		const { deps } = createMockStore();
		const app = createApp(deps);

		await app.handle(
			new Request(`${BASE}/journals/j-1/notes`, {
				method: "PATCH",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ note: "First note" }),
			}),
		);

		const res = await app.handle(
			new Request(`${BASE}/journals/j-1/notes`, {
				method: "PATCH",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ note: "Second note replaces first" }),
			}),
		);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data.notes).toBe("Second note replaces first");
	});

	test("returns 404 for another user's journal", async () => {
		const { deps } = createMockStore();
		const app = createApp(deps, OTHER_USER_ID);
		const res = await app.handle(
			new Request(`${BASE}/journals/j-1/notes`, {
				method: "PATCH",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ note: "Unauthorized note" }),
			}),
		);
		expect(res.status).toBe(404);
	});

	test("returns 400 for note exceeding 2000 characters", async () => {
		const { deps } = createMockStore();
		const app = createApp(deps);
		const longNote = "a".repeat(2001);
		const res = await app.handle(
			new Request(`${BASE}/journals/j-1/notes`, {
				method: "PATCH",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ note: longNote }),
			}),
		);
		expect(res.status).toBe(400);
	});

	test("allows empty string to clear note", async () => {
		const { deps } = createMockStore();
		const app = createApp(deps);
		const res = await app.handle(
			new Request(`${BASE}/journals/j-1/notes`, {
				method: "PATCH",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ note: "" }),
			}),
		);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data.notes).toBe("");
	});
});

// ---------------------------------------------------------------------------
// POST /journals/:id/tags
// ---------------------------------------------------------------------------

describe("POST /journals/:id/tags", () => {
	test("appends a valid tag", async () => {
		const { deps } = createMockStore();
		const app = createApp(deps);
		const res = await app.handle(
			new Request(`${BASE}/journals/j-1/tags`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ tag: "breakout" }),
			}),
		);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data.tags).toContain("breakout");
	});

	test("is idempotent on duplicate tag", async () => {
		const { deps } = createMockStore();
		const app = createApp(deps);

		await app.handle(
			new Request(`${BASE}/journals/j-1/tags`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ tag: "breakout" }),
			}),
		);

		const res = await app.handle(
			new Request(`${BASE}/journals/j-1/tags`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ tag: "breakout" }),
			}),
		);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data.tags.filter((t: string) => t === "breakout")).toHaveLength(1);
	});

	test("returns 400 for invalid tag format (spaces)", async () => {
		const { deps } = createMockStore();
		const app = createApp(deps);
		const res = await app.handle(
			new Request(`${BASE}/journals/j-1/tags`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ tag: "invalid tag" }),
			}),
		);
		expect(res.status).toBe(400);
	});

	test("returns 400 for tag exceeding 50 characters", async () => {
		const { deps } = createMockStore();
		const app = createApp(deps);
		const longTag = "a".repeat(51);
		const res = await app.handle(
			new Request(`${BASE}/journals/j-1/tags`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ tag: longTag }),
			}),
		);
		expect(res.status).toBe(400);
	});

	test("returns 400 when 20-tag limit is reached", async () => {
		const { deps } = createMockStore();
		// Pre-fill 20 tags
		deps.getTagCount = async (_id, _userId) => 20;
		const app = createApp(deps);
		const res = await app.handle(
			new Request(`${BASE}/journals/j-1/tags`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ tag: "new-tag" }),
			}),
		);
		expect(res.status).toBe(400);
	});

	test("returns 404 for another user's journal", async () => {
		const { deps } = createMockStore();
		const app = createApp(deps, OTHER_USER_ID);
		const res = await app.handle(
			new Request(`${BASE}/journals/j-1/tags`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ tag: "breakout" }),
			}),
		);
		expect(res.status).toBe(404);
	});

	test("accepts tags with hyphens and underscores", async () => {
		const { deps } = createMockStore();
		const app = createApp(deps);
		const res = await app.handle(
			new Request(`${BASE}/journals/j-1/tags`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ tag: "fomo-trade_v2" }),
			}),
		);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data.tags).toContain("fomo-trade_v2");
	});
});

// ---------------------------------------------------------------------------
// DELETE /journals/:id/tags/:tag
// ---------------------------------------------------------------------------

describe("DELETE /journals/:id/tags/:tag", () => {
	test("removes an existing tag", async () => {
		const { deps, journals } = createMockStore();
		// Pre-populate tag
		const j0 = journals[0];
		if (j0) j0.tags = ["breakout", "trend"];
		const app = createApp(deps);
		const res = await app.handle(
			new Request(`${BASE}/journals/j-1/tags/breakout`, {
				method: "DELETE",
			}),
		);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data.tags).not.toContain("breakout");
		expect(body.data.tags).toContain("trend");
	});

	test("is no-op when tag is absent (no error)", async () => {
		const { deps } = createMockStore();
		const app = createApp(deps);
		const res = await app.handle(
			new Request(`${BASE}/journals/j-1/tags/nonexistent`, {
				method: "DELETE",
			}),
		);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data.tags).toBeArray();
	});

	test("returns 404 for another user's journal", async () => {
		const { deps } = createMockStore();
		const app = createApp(deps, OTHER_USER_ID);
		const res = await app.handle(
			new Request(`${BASE}/journals/j-1/tags/breakout`, {
				method: "DELETE",
			}),
		);
		expect(res.status).toBe(404);
	});
});

// ---------------------------------------------------------------------------
// GET /journals/tags
// ---------------------------------------------------------------------------

describe("GET /journals/tags", () => {
	test("returns distinct sorted tags for authenticated user", async () => {
		const { deps, journals } = createMockStore();
		const j0 = journals[0];
		if (j0) j0.tags = ["trend", "breakout", "fomo"];
		const app = createApp(deps);
		const res = await app.handle(new Request(`${BASE}/journals/tags`));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data.tags).toEqual(["breakout", "fomo", "trend"]);
	});

	test("returns empty array when user has no tags", async () => {
		const { deps } = createMockStore();
		const app = createApp(deps, OTHER_USER_ID);
		const res = await app.handle(new Request(`${BASE}/journals/tags`));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data.tags).toEqual([]);
	});

	test("returns only the authenticated user's tags", async () => {
		const { deps, journals } = createMockStore();
		// Add a journal for user-other with different tags
		journals.push({
			...sampleJournal,
			id: "j-2",
			userId: OTHER_USER_ID,
			tags: ["other-user-tag"],
		});
		const j0 = journals[0];
		if (j0) j0.tags = ["my-tag"];
		const app = createApp(deps);
		const res = await app.handle(new Request(`${BASE}/journals/tags`));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data.tags).toContain("my-tag");
		expect(body.data.tags).not.toContain("other-user-tag");
	});
});
