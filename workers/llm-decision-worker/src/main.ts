import type { LlmDecision } from "@combine/core/macro/decision-prompt-builder.js";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { createLlmDecisionRepository } from "./db.js";
import { LlmDecisionWorker } from "./index.js";

// 1. Validate DATABASE_URL
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	console.error("DATABASE_URL not set");
	process.exit(1);
}

// 2. Validate ANTHROPIC_API_KEY
const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
if (!anthropicApiKey) {
	console.error("ANTHROPIC_API_KEY not set — LLM Decision worker requires Claude API access");
	process.exit(1);
}

// 3. Create Drizzle db instance
const pool = postgres(databaseUrl);
const db = drizzle(pool);

// 4. Create dedicated LISTEN connection
const listenClient = postgres(databaseUrl, { max: 1 });

// 5. Create publish connection for NOTIFY
const publishClient = postgres(databaseUrl, { max: 1 });

// 6. Build repository with publish capability
const repository = createLlmDecisionRepository(db, {
	unsafe: (query: string) => publishClient.unsafe(query),
});

// 7. Build LLM evaluate function using Anthropic SDK
async function evaluate(prompt: string): Promise<LlmDecision> {
	const response = await fetch("https://api.anthropic.com/v1/messages", {
		method: "POST",
		headers: {
			"x-api-key": anthropicApiKey,
			"anthropic-version": "2023-06-01",
			"content-type": "application/json",
		},
		body: JSON.stringify({
			model: "claude-3-5-haiku-20241022",
			max_tokens: 512,
			messages: [{ role: "user", content: prompt }],
		}),
	});

	if (!response.ok) {
		throw new Error(`Anthropic API error: ${response.status} ${response.statusText}`);
	}

	const data = (await response.json()) as {
		content: Array<{ type: string; text: string }>;
	};

	const text = data.content.find((c) => c.type === "text")?.text ?? "";

	// Extract JSON from response
	const jsonMatch = text.match(/\{[\s\S]*\}/);
	if (!jsonMatch) {
		throw new Error(`LLM response did not contain valid JSON: ${text}`);
	}

	return JSON.parse(jsonMatch[0]) as LlmDecision;
}

// 8. Instantiate the worker
const worker = new LlmDecisionWorker({ repository, evaluate });

// 9. LISTEN on decision_pending_llm
await listenClient.listen("decision_pending_llm", async (payload: string) => {
	let decisionId: string;
	try {
		const parsed = JSON.parse(payload) as { decisionId?: string } | string;
		decisionId =
			typeof parsed === "string" ? parsed : ((parsed as { decisionId?: string }).decisionId ?? payload);
	} catch {
		// Payload may be a bare UUID
		decisionId = payload;
	}

	try {
		await worker.processDecision(decisionId);
	} catch (err) {
		console.error({ decisionId, error: (err as Error).message }, "LLM Decision worker error");
	}
});

console.log("LLM Decision worker started");

// 10. Graceful shutdown on SIGTERM/SIGINT
async function shutdown(signal: string): Promise<void> {
	console.log(`Received ${signal}, shutting down...`);
	await listenClient.end();
	await publishClient.end();
	await pool.end();
	process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
