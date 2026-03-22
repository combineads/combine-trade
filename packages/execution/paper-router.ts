import type { ExecutionMode } from "./types.js";

export interface OrderRequest {
	symbol: string;
	side: "BUY" | "SELL";
	size: string;
	price: string;
}

export interface PaperOrderResult {
	type: "paper";
	paperId: string;
	symbol: string;
	side: "BUY" | "SELL";
	size: string;
	filledPrice: string;
	filledAt: number;
}

export interface OrderResult {
	type: "real";
	orderId: string;
	symbol: string;
	side: "BUY" | "SELL";
	size: string;
	filledPrice: string;
	filledAt: number;
}

export interface PaperOrderMatcher {
	matchOrder(order: OrderRequest): Promise<PaperOrderResult>;
}

export interface RealOrderExecutor {
	executeOrder(order: OrderRequest): Promise<OrderResult>;
}

export class PaperRouter {
	constructor(
		private real: RealOrderExecutor,
		private paper: PaperOrderMatcher,
	) {}

	async execute(order: OrderRequest, mode: ExecutionMode): Promise<OrderResult | PaperOrderResult> {
		if (mode === "paper") {
			return this.paper.matchOrder(order);
		}
		return this.real.executeOrder(order);
	}
}

export function formatAlertMessage(message: string, mode: ExecutionMode): string {
	if (mode === "paper") {
		return `[PAPER] ${message}`;
	}
	return message;
}
