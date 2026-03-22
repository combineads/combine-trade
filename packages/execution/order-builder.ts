import Decimal from "decimal.js";

const DEFAULT_MAX_NOTIONAL = 1000; // $1,000 pre-EP09 safety cap

export interface OrderInput {
	strategyId: string;
	eventId: string;
	symbol: string;
	direction: "LONG" | "SHORT";
	entryPrice: string;
	tpPct: number;
	slPct: number;
	quantity: string;
}

export interface OrderPayload {
	symbol: string;
	side: "buy" | "sell";
	type: "market";
	quantity: string;
	entryPrice: string;
	tpPrice: string;
	slPrice: string;
	clientOrderId: string;
}

/** Generate a deterministic client order ID. */
export function generateClientOrderId(strategyId: string, eventId: string, ts: number): string {
	return `ct-${strategyId}-${eventId}-${ts}`;
}

/** Build an exchange order payload from a decision. */
export function buildOrder(
	input: OrderInput,
	ts: number = Date.now(),
	maxNotional: number = DEFAULT_MAX_NOTIONAL,
): OrderPayload {
	const entry = new Decimal(input.entryPrice);
	const qty = new Decimal(input.quantity);
	const notional = entry.mul(qty);

	if (notional.gt(maxNotional)) {
		throw new Error(
			`Order notional ${notional.toString()} exceeds max notional cap ${maxNotional}`,
		);
	}

	const isLong = input.direction === "LONG";

	const tpPrice = isLong
		? entry.mul(new Decimal(1).plus(new Decimal(input.tpPct).div(100)))
		: entry.mul(new Decimal(1).minus(new Decimal(input.tpPct).div(100)));

	const slPrice = isLong
		? entry.mul(new Decimal(1).minus(new Decimal(input.slPct).div(100)))
		: entry.mul(new Decimal(1).plus(new Decimal(input.slPct).div(100)));

	return {
		symbol: input.symbol,
		side: isLong ? "buy" : "sell",
		type: "market",
		quantity: input.quantity,
		entryPrice: input.entryPrice,
		tpPrice: tpPrice.toString(),
		slPrice: slPrice.toString(),
		clientOrderId: generateClientOrderId(input.strategyId, input.eventId, ts),
	};
}
