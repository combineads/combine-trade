import type { LlmDecision } from "./decision-prompt-builder.js";

export type LlmSpawnRunner = (prompt: string) => Promise<string>;

const CONFIRM_FALLBACK: LlmDecision = {
	action: "CONFIRM",
	reason: "LLM evaluation unavailable, preserving kNN decision",
	confidence: 0,
	risk_factors: [],
};

const VALID_ACTIONS = new Set(["CONFIRM", "PASS", "REDUCE_SIZE"]);

function tryParseJson(raw: string): unknown | null {
	const trimmed = raw.trim();
	if (!trimmed) return null;

	// Try direct parse
	try {
		return JSON.parse(trimmed);
	} catch {
		// Try extracting from markdown code block
	}

	const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
	if (codeBlockMatch) {
		try {
			return JSON.parse(codeBlockMatch[1].trim());
		} catch {
			return null;
		}
	}

	return null;
}

function isValidDecision(obj: unknown): obj is LlmDecision {
	if (!obj || typeof obj !== "object") return false;
	const record = obj as Record<string, unknown>;
	if (typeof record.action !== "string") return false;
	return VALID_ACTIONS.has(record.action);
}

export async function evaluateWithLlm(
	prompt: string,
	spawn: LlmSpawnRunner,
): Promise<LlmDecision> {
	let output: string;
	try {
		output = await spawn(prompt);
	} catch (err) {
		console.warn("LLM evaluation spawn failed:", err);
		return CONFIRM_FALLBACK;
	}

	const parsed = tryParseJson(output);
	if (!parsed) {
		console.warn("LLM output not valid JSON");
		return CONFIRM_FALLBACK;
	}

	if (!isValidDecision(parsed)) {
		console.warn("LLM output missing valid action field");
		return CONFIRM_FALLBACK;
	}

	return {
		action: parsed.action,
		reason: typeof parsed.reason === "string" ? parsed.reason : "",
		confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
		risk_factors: Array.isArray(parsed.risk_factors)
			? parsed.risk_factors
			: [],
	};
}
