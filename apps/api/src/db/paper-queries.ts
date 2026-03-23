import { count, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../../../../db/schema/index.js";
import type { PaperPeriod, PaperRouteDeps } from "../routes/paper.js";

type Db = PostgresJsDatabase<typeof schema>;

export function createPaperDeps(db: Db): PaperRouteDeps {
	return {
		getPaperStatus: async (): Promise<{
			balance: string;
			positions: {
				symbol: string;
				side: "LONG" | "SHORT";
				size: string;
				entryPrice: string;
				unrealizedPnl: string;
			}[];
			unrealizedPnl: string;
			totalPnl: string;
		}> => {
			const [balanceRow] = await db.select().from(schema.paperBalances).limit(1);
			const positions = await db.select().from(schema.paperPositions);

			const totalUnrealizedPnl = positions
				.reduce((sum, p) => sum + Number(p.unrealizedPnl), 0)
				.toString();

			return {
				balance: balanceRow?.balance ?? "10000",
				positions: positions.map((p) => ({
					symbol: p.symbol,
					side: p.side.toUpperCase() as "LONG" | "SHORT",
					size: p.quantity,
					entryPrice: p.entryPrice,
					unrealizedPnl: p.unrealizedPnl,
				})),
				unrealizedPnl: totalUnrealizedPnl,
				totalPnl: "0",
			};
		},

		listPaperOrders: async (query: {
			page: number;
			pageSize: number;
		}): Promise<{ data: unknown[]; total: number }> => {
			const offset = (query.page - 1) * query.pageSize;

			const [rows, [countRow]] = await Promise.all([
				db.select().from(schema.paperOrders).limit(query.pageSize).offset(offset),
				db.select({ total: count() }).from(schema.paperOrders),
			]);

			return {
				data: rows,
				total: countRow?.total ?? 0,
			};
		},

		getPaperPerformance: async (_period: PaperPeriod): Promise<{ summaries: unknown[] }> => {
			// Performance summaries require time-series aggregation logic
			// Return empty for now until workers provide the data
			return { summaries: [] };
		},

		getPaperComparison: async (
			_strategyId: string,
			_symbol: string,
		): Promise<{ backtest: unknown; paper: unknown; delta: unknown }> => {
			// Comparison requires backtest engine integration
			// Return empty for now
			return { backtest: {}, paper: {}, delta: {} };
		},

		resetPaper: async (initialBalance: string): Promise<{ success: true; balance: string }> => {
			// Delete all paper positions and orders, reset balance
			await db.delete(schema.paperPositions);
			await db.delete(schema.paperOrders);

			// Check if a balance row exists; if so update, else we can't insert (no userId)
			const [existing] = await db.select().from(schema.paperBalances).limit(1);
			if (existing) {
				await db
					.update(schema.paperBalances)
					.set({
						balance: initialBalance,
						initialBalance,
						updatedAt: new Date(),
					})
					.where(sql`id = ${existing.id}`);
			}

			return { success: true, balance: initialBalance };
		},
	};
}
