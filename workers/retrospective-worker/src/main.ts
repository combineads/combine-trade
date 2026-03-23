import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { createRetrospectiveRepository } from "./db.js";
import { RetrospectiveWorker } from "./index.js";

// 1. Validate DATABASE_URL
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	console.error("DATABASE_URL not set");
	process.exit(1);
}

// 2. Validate ANTHROPIC_API_KEY
const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
if (!anthropicApiKey) {
	console.error("ANTHROPIC_API_KEY not set — Retrospective worker requires Claude API access");
	process.exit(1);
}

// 3. Create Drizzle db instance
const pool = postgres(databaseUrl);
const db = drizzle(pool);

// 4. Create dedicated LISTEN connection
const listenClient = postgres(databaseUrl, { max: 1 });

// 5. Build repository
const repository = createRetrospectiveRepository(db);

// 6. Build SpawnRunner using Anthropic API
async function spawn(prompt: string): Promise<string> {
	const response = await fetch("https://api.anthropic.com/v1/messages", {
		method: "POST",
		headers: {
			"x-api-key": anthropicApiKey,
			"anthropic-version": "2023-06-01",
			"content-type": "application/json",
		},
		body: JSON.stringify({
			model: "claude-3-5-haiku-20241022",
			max_tokens: 1024,
			messages: [{ role: "user", content: prompt }],
		}),
	});

	if (!response.ok) {
		throw new Error(`Anthropic API error: ${response.status} ${response.statusText}`);
	}

	const data = (await response.json()) as {
		content: Array<{ type: string; text: string }>;
	};

	return data.content.find((c) => c.type === "text")?.text ?? "";
}

// 7. Instantiate the worker
const worker = new RetrospectiveWorker({ repository, spawn });

// 8. LISTEN on journal_ready
await listenClient.listen("journal_ready", async (payload: string) => {
	let journalId: string;
	try {
		const parsed = JSON.parse(payload) as { journalId?: string } | string;
		journalId =
			typeof parsed === "string"
				? parsed
				: ((parsed as { journalId?: string }).journalId ?? payload);
	} catch {
		// Payload may be a bare UUID
		journalId = payload;
	}

	try {
		await worker.processJournal(journalId);
	} catch (err) {
		console.error({ journalId, error: (err as Error).message }, "Retrospective worker error");
	}
});

console.log("Retrospective worker started");

// 9. Graceful shutdown on SIGTERM/SIGINT
async function shutdown(signal: string): Promise<void> {
	console.log(`Received ${signal}, shutting down...`);
	await listenClient.end();
	await pool.end();
	process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
