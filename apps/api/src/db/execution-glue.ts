import { and, eq, isNull } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../../../../db/schema/index.js";
import type { ExecutionModeDbDeps } from "@combine/execution/mode-db.js";

type Db = PostgresJsDatabase<typeof schema>;

export function createExecutionModeDbDeps(db: Db): ExecutionModeDbDeps {
	return {
		loadStrategyMode: async (strategyId) => {
			const rows = await db
				.select({ executionMode: schema.strategies.executionMode })
				.from(schema.strategies)
				.where(and(eq(schema.strategies.id, strategyId), isNull(schema.strategies.deletedAt)))
				.limit(1);
			return rows[0]?.executionMode ?? null;
		},

		saveStrategyMode: async (strategyId, mode) => {
			await db
				.update(schema.strategies)
				.set({ executionMode: mode, updatedAt: new Date() })
				.where(and(eq(schema.strategies.id, strategyId), isNull(schema.strategies.deletedAt)));
		},

		hasActiveKillSwitch: async () => {
			const rows = await db
				.select({ id: schema.killSwitchState.id })
				.from(schema.killSwitchState)
				.where(eq(schema.killSwitchState.isActive, true))
				.limit(1);
			return rows.length > 0;
		},

		hasDailyLossLimit: async () => {
			const rows = await db
				.select({ id: schema.dailyLossLimits.id })
				.from(schema.dailyLossLimits)
				.limit(1);
			return rows.length > 0;
		},
	};
}
