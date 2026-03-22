import type { ImpactLevel } from "./types.js";

/**
 * Parse impact level from star notation in event titles.
 *
 * saveticker.com uses star characters to denote impact:
 * - ★★★ or ⭐⭐⭐ → HIGH
 * - ★★ or ⭐⭐ → MEDIUM
 * - ★ or ⭐ → LOW
 *
 * Falls back to LOW if no stars found.
 */
export function parseImpactFromTitle(title: string): ImpactLevel {
	// Count star characters (★ or ⭐)
	const starCount = (title.match(/[★⭐]/g) || []).length;

	if (starCount >= 3) return "HIGH";
	if (starCount === 2) return "MEDIUM";
	return "LOW";
}

/**
 * Extract clean event name from a title by removing star notation.
 */
export function extractEventName(title: string): string {
	return title.replace(/[★⭐]+/g, "").trim();
}

/**
 * Check if an event should be collected based on impact level.
 * Only HIGH and MEDIUM impact events are collected by default.
 */
export function shouldCollect(impact: ImpactLevel, includelow = false): boolean {
	if (includelow) return true;
	return impact === "HIGH" || impact === "MEDIUM";
}
