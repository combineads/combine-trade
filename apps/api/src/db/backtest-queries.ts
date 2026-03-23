import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../../../../db/schema/index.js";
import { ApiError } from "../lib/errors.js";
import type { BacktestRouteDeps } from "../routes/backtest.js";

type Db = PostgresJsDatabase<typeof schema>;

export function createBacktestDeps(db: Db): BacktestRouteDeps {
	return {
		strategyExists: async (id: string): Promise<boolean> => {
			const rows = await db
				.select({ id: schema.strategies.id })
				.from(schema.strategies)
				.where(eq(schema.strategies.id, id))
				.limit(1);
			return rows.length > 0;
		},

		runBacktest: async (): Promise<never> => {
			throw new ApiError(503, "BACKTEST_NOT_WIRED", "Backtest engine not yet wired");
		},
	};
}
