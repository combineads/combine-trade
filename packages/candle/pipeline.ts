import type { Candle } from "./types.js";
import type { CandleRepository } from "./repository.js";
import { validateContinuity } from "./validation.js";

type NotifyFn = (candle: Candle) => void;
type GapFn = (description: string) => void;
type ErrorFn = (description: string) => void;

/** Last seen closed candle per key, used for continuity checking */
const lastSeen = new Map<string, Candle>();

function candleKey(c: Candle): string {
	return `${c.exchange}:${c.symbol}:${c.timeframe}`;
}

function parseCandle(raw: string): Candle {
	let parsed: Record<string, unknown>;
	try {
		parsed = JSON.parse(raw) as Record<string, unknown>;
	} catch {
		throw new Error("invalid JSON");
	}

	const required = ["exchange", "symbol", "timeframe", "open", "high", "low", "close", "volume"];
	for (const field of required) {
		if (parsed[field] == null) {
			throw new Error(`missing required field: ${field}`);
		}
	}

	if (parsed.openTime == null) {
		throw new Error("missing required field: openTime");
	}

	return {
		exchange: parsed.exchange as Candle["exchange"],
		symbol: parsed.symbol as string,
		timeframe: parsed.timeframe as Candle["timeframe"],
		openTime: new Date(parsed.openTime as string | number),
		open: String(parsed.open),
		high: String(parsed.high),
		low: String(parsed.low),
		close: String(parsed.close),
		volume: String(parsed.volume),
		isClosed: Boolean(parsed.isClosed),
	};
}

/**
 * Process a raw WebSocket candle message through the full pipeline:
 * parse → validate continuity → upsert → NOTIFY (if closed).
 *
 * @param raw       - Raw JSON string from WebSocket
 * @param repo      - CandleRepository for persistence
 * @param onNotify  - Called when a closed candle is persisted (triggers downstream processing)
 * @param onGap     - Called when a continuity gap is detected (optional)
 * @param onError   - Called when the message is rejected (parse failure, missing fields)
 */
export async function processCandleMessage(
	raw: string,
	repo: CandleRepository,
	onNotify: NotifyFn,
	onGap?: GapFn,
	onError?: ErrorFn,
): Promise<void> {
	let candle: Candle;

	try {
		candle = parseCandle(raw);
	} catch (err) {
		onError?.((err as Error).message);
		return;
	}

	// Continuity check against last seen candle for this key
	const key = candleKey(candle);
	const prev = lastSeen.get(key);

	if (prev != null) {
		const gaps = validateContinuity([prev, candle]);
		if (gaps.length > 0) {
			const first = gaps[0]!;
			onGap?.(
				`gap detected: expected ${first.expectedTime.toISOString()} but got ${candle.openTime.toISOString()} (${gaps.length} missing candle(s))`,
			);
		}
	}

	// Persist
	await repo.upsert(candle);

	// Track for next continuity check
	if (candle.isClosed) {
		lastSeen.set(key, candle);
	}

	// NOTIFY downstream only for closed candles
	if (candle.isClosed) {
		onNotify(candle);
	}
}
