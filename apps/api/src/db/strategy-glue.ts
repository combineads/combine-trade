import { and, eq, isNull } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../../../../db/schema/index.js";
import type {
	StrategyDbDeps,
	StrategyRow,
} from "@combine/core/strategy/drizzle-repository.js";
import type {
	CreateStrategyInput,
	UpdateStrategyInput,
} from "@combine/core/strategy/types.js";

type Db = PostgresJsDatabase<typeof schema>;

function mapRow(row: typeof schema.strategies.$inferSelect): StrategyRow {
	return {
		id: row.id,
		version: row.version,
		name: row.name,
		description: row.description,
		code: row.code,
		symbols: row.symbols,
		timeframe: row.timeframe,
		direction: row.direction,
		featuresDefinition: row.featuresDefinition,
		normalizationConfig: row.normalizationConfig,
		searchConfig: row.searchConfig,
		resultConfig: row.resultConfig,
		decisionConfig: row.decisionConfig,
		executionMode: row.executionMode,
		apiVersion: row.apiVersion,
		status: row.status,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
		deletedAt: row.deletedAt,
	};
}

export function createStrategyDbDeps(db: Db): StrategyDbDeps {
	return {
		findAll: async (userId) => {
			const rows = await db
				.select()
				.from(schema.strategies)
				.where(and(eq(schema.strategies.userId, userId), isNull(schema.strategies.deletedAt)));
			return rows.map(mapRow);
		},

		findById: async (id, userId) => {
			const rows = await db
				.select()
				.from(schema.strategies)
				.where(
					and(
						eq(schema.strategies.id, id),
						eq(schema.strategies.userId, userId),
						isNull(schema.strategies.deletedAt),
					),
				)
				.limit(1);
			return rows[0] ? mapRow(rows[0]) : null;
		},

		findByNameAndVersion: async (name, version, userId) => {
			const rows = await db
				.select()
				.from(schema.strategies)
				.where(
					and(
						eq(schema.strategies.name, name),
						eq(schema.strategies.version, version),
						eq(schema.strategies.userId, userId),
						isNull(schema.strategies.deletedAt),
					),
				)
				.limit(1);
			return rows[0] ? mapRow(rows[0]) : null;
		},

		findActive: async (userId) => {
			const rows = await db
				.select()
				.from(schema.strategies)
				.where(
					and(
						eq(schema.strategies.userId, userId),
						eq(schema.strategies.status, "active"),
						isNull(schema.strategies.deletedAt),
					),
				);
			return rows.map(mapRow);
		},

		create: async (input: CreateStrategyInput, userId) => {
			const rows = await db
				.insert(schema.strategies)
				.values({
					userId,
					name: input.name,
					description: input.description ?? null,
					code: input.code,
					symbols: input.symbols,
					timeframe: input.timeframe,
					direction: input.direction,
					featuresDefinition: input.featuresDefinition,
					normalizationConfig: input.normalizationConfig,
					searchConfig: input.searchConfig,
					resultConfig: input.resultConfig,
					decisionConfig: input.decisionConfig,
					executionMode: input.executionMode ?? "analysis",
					apiVersion: input.apiVersion ?? null,
					status: "draft",
				})
				.returning();
			const row = rows[0];
			if (!row) throw new Error("Failed to create strategy");
			return mapRow(row);
		},

		update: async (id, input: UpdateStrategyInput, userId) => {
			const now = new Date();
			const rows = await db
				.update(schema.strategies)
				.set({
					...(input.name !== undefined && { name: input.name }),
					...(input.description !== undefined && { description: input.description ?? null }),
					...(input.code !== undefined && { code: input.code }),
					...(input.symbols !== undefined && { symbols: input.symbols }),
					...(input.timeframe !== undefined && { timeframe: input.timeframe }),
					...(input.direction !== undefined && { direction: input.direction }),
					...(input.featuresDefinition !== undefined && {
						featuresDefinition: input.featuresDefinition,
					}),
					...(input.normalizationConfig !== undefined && {
						normalizationConfig: input.normalizationConfig,
					}),
					...(input.searchConfig !== undefined && { searchConfig: input.searchConfig }),
					...(input.resultConfig !== undefined && { resultConfig: input.resultConfig }),
					...(input.decisionConfig !== undefined && { decisionConfig: input.decisionConfig }),
					...(input.executionMode !== undefined && { executionMode: input.executionMode }),
					...(input.apiVersion !== undefined && { apiVersion: input.apiVersion ?? null }),
					updatedAt: now,
				})
				.where(
					and(
						eq(schema.strategies.id, id),
						eq(schema.strategies.userId, userId),
						isNull(schema.strategies.deletedAt),
					),
				)
				.returning();
			const row = rows[0];
			if (!row) throw new Error(`Strategy ${id} not found`);
			return mapRow(row);
		},

		softDelete: async (id, userId) => {
			await db
				.update(schema.strategies)
				.set({ deletedAt: new Date(), updatedAt: new Date() })
				.where(
					and(
						eq(schema.strategies.id, id),
						eq(schema.strategies.userId, userId),
						isNull(schema.strategies.deletedAt),
					),
				);
		},
	};
}
