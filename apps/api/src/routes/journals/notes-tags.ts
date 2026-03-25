import { Elysia, t } from "elysia";
import { NotFoundError } from "../../lib/errors.js";
import { ok } from "../../lib/response.js";

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const NOTE_MAX_LENGTH = 2000;
const TAG_MAX_LENGTH = 50;
const TAG_MAX_COUNT = 20;
const TAG_FORMAT_RE = /^[a-zA-Z0-9_-]+$/;

/** Validate tag format and length. Returns error message or null if valid. */
export function validateTag(tag: string): string | null {
	if (tag.length === 0) return "Tag must not be empty";
	if (tag.length > TAG_MAX_LENGTH) return `Tag must be at most ${TAG_MAX_LENGTH} characters`;
	if (!TAG_FORMAT_RE.test(tag))
		return "Tag must contain only alphanumeric characters, hyphens, and underscores";
	return null;
}

// ---------------------------------------------------------------------------
// Dependency interface
// ---------------------------------------------------------------------------

export interface JournalNoteTagDeps {
	/** Set the note on a journal entry. Returns updated entry or null if not found / not owned. */
	setNote: (id: string, note: string, userId: string) => Promise<unknown | null>;
	/** Add a tag to a journal entry. Returns updated tags array or null if not found / not owned. */
	addTag: (id: string, tag: string, userId: string) => Promise<string[] | null>;
	/** Remove a tag from a journal entry. Returns updated tags array or null if not found / not owned. */
	removeTag: (id: string, tag: string, userId: string) => Promise<string[] | null>;
	/** List all distinct custom tags for a user, sorted alphabetically. */
	listTags: (userId: string) => Promise<string[]>;
	/** Get current tag count for a journal entry. Returns null if not found / not owned. */
	getTagCount: (id: string, userId: string) => Promise<number | null>;
}

// ---------------------------------------------------------------------------
// Extract userId from Elysia context (betterAuthPlugin derives it globally)
// ---------------------------------------------------------------------------

function extractUserId(ctx: Record<string, unknown>): string {
	return typeof ctx.userId === "string" ? ctx.userId : "";
}

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

export function journalNoteTagRoutes(deps: JournalNoteTagDeps) {
	return new Elysia()
		.patch(
			"/api/v1/journals/:id/notes",
			async (ctx) => {
				const userId = extractUserId(ctx as unknown as Record<string, unknown>);
				const { id } = ctx.params;
				const { note } = ctx.body;

				if (note.length > NOTE_MAX_LENGTH) {
					ctx.set.status = 400;
					return {
						error: {
							code: "VALIDATION_ERROR",
							message: `Note must be at most ${NOTE_MAX_LENGTH} characters`,
						},
					};
				}

				const entry = await deps.setNote(id, note, userId);
				if (!entry) throw new NotFoundError(`Journal ${id} not found`);

				return ok(entry);
			},
			{
				params: t.Object({ id: t.String() }),
				body: t.Object({ note: t.String() }),
			},
		)
		.post(
			"/api/v1/journals/:id/tags",
			async (ctx) => {
				const userId = extractUserId(ctx as unknown as Record<string, unknown>);
				const { id } = ctx.params;
				const { tag } = ctx.body;

				const formatError = validateTag(tag);
				if (formatError) {
					ctx.set.status = 400;
					return { error: { code: "VALIDATION_ERROR", message: formatError } };
				}

				const currentCount = await deps.getTagCount(id, userId);
				if (currentCount === null) throw new NotFoundError(`Journal ${id} not found`);

				if (currentCount >= TAG_MAX_COUNT) {
					ctx.set.status = 400;
					return {
						error: {
							code: "VALIDATION_ERROR",
							message: `Maximum ${TAG_MAX_COUNT} custom tags per journal entry`,
						},
					};
				}

				const tags = await deps.addTag(id, tag, userId);
				if (!tags) throw new NotFoundError(`Journal ${id} not found`);

				return ok({ tags });
			},
			{
				params: t.Object({ id: t.String() }),
				body: t.Object({ tag: t.String() }),
			},
		)
		.delete(
			"/api/v1/journals/:id/tags/:tag",
			async (ctx) => {
				const userId = extractUserId(ctx as unknown as Record<string, unknown>);
				const { id, tag } = ctx.params;

				const tags = await deps.removeTag(id, tag, userId);
				if (!tags) throw new NotFoundError(`Journal ${id} not found`);

				return ok({ tags });
			},
			{
				params: t.Object({ id: t.String(), tag: t.String() }),
			},
		)
		.get("/api/v1/journals/tags", async (ctx) => {
			const userId = extractUserId(ctx as unknown as Record<string, unknown>);
			const tags = await deps.listTags(userId);
			return ok({ tags });
		});
}
