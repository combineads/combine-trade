import type { StrategyRepository } from "./repository.js";
import type {
	Strategy,
	CreateStrategyInput,
	UpdateStrategyInput,
	FeatureDefinition,
} from "./types.js";

/**
 * Raw database row shape matching the strategies Drizzle schema.
 * Used for mapping between DB rows and domain types.
 */
export interface StrategyRow {
	id: string;
	version: number;
	name: string;
	description: string | null;
	code: string;
	symbols: string[];
	timeframe: string;
	direction: string;
	featuresDefinition: unknown;
	normalizationConfig: unknown;
	searchConfig: unknown;
	resultConfig: unknown;
	decisionConfig: unknown;
	executionMode: string;
	apiVersion: string | null;
	status: string;
	createdAt: Date;
	updatedAt: Date;
	deletedAt: Date | null;
}

/**
 * Database query dependencies for strategy operations.
 * Concrete Drizzle queries are injected, keeping the repository testable.
 */
export interface StrategyDbDeps {
	findAll: () => Promise<StrategyRow[]>;
	findById: (id: string) => Promise<StrategyRow | null>;
	findByNameAndVersion: (name: string, version: number) => Promise<StrategyRow | null>;
	findActive: () => Promise<StrategyRow[]>;
	create: (input: CreateStrategyInput) => Promise<StrategyRow>;
	update: (id: string, input: UpdateStrategyInput) => Promise<StrategyRow>;
	softDelete: (id: string) => Promise<void>;
}

function mapRowToStrategy(row: StrategyRow): Strategy {
	return {
		id: row.id,
		version: row.version,
		name: row.name,
		description: row.description,
		code: row.code,
		symbols: row.symbols,
		timeframe: row.timeframe as Strategy["timeframe"],
		direction: row.direction as Strategy["direction"],
		featuresDefinition: row.featuresDefinition as FeatureDefinition[],
		normalizationConfig: (row.normalizationConfig ?? {}) as Record<string, unknown>,
		searchConfig: (row.searchConfig ?? {}) as Record<string, unknown>,
		resultConfig: (row.resultConfig ?? {}) as Record<string, unknown>,
		decisionConfig: (row.decisionConfig ?? {}) as Record<string, unknown>,
		executionMode: row.executionMode as Strategy["executionMode"],
		apiVersion: row.apiVersion,
		status: row.status as Strategy["status"],
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
		deletedAt: row.deletedAt,
	};
}

export class DrizzleStrategyRepository implements StrategyRepository {
	constructor(private readonly deps: StrategyDbDeps) {}

	async findAll(): Promise<Strategy[]> {
		const rows = await this.deps.findAll();
		return rows.map(mapRowToStrategy);
	}

	async findById(id: string): Promise<Strategy | null> {
		const row = await this.deps.findById(id);
		return row ? mapRowToStrategy(row) : null;
	}

	async findByNameAndVersion(name: string, version: number): Promise<Strategy | null> {
		const row = await this.deps.findByNameAndVersion(name, version);
		return row ? mapRowToStrategy(row) : null;
	}

	async findActive(): Promise<Strategy[]> {
		const rows = await this.deps.findActive();
		return rows.map(mapRowToStrategy);
	}

	async create(input: CreateStrategyInput): Promise<Strategy> {
		const row = await this.deps.create(input);
		return mapRowToStrategy(row);
	}

	async update(id: string, input: UpdateStrategyInput): Promise<Strategy> {
		const row = await this.deps.update(id, input);
		return mapRowToStrategy(row);
	}

	async softDelete(id: string): Promise<void> {
		await this.deps.softDelete(id);
	}

	async createNewVersion(id: string, input: UpdateStrategyInput): Promise<Strategy> {
		const existing = await this.deps.findById(id);
		if (!existing) {
			throw new Error(`Strategy ${id} not found`);
		}

		const createInput: CreateStrategyInput = {
			name: input.name ?? existing.name,
			description: input.description ?? existing.description ?? undefined,
			code: input.code ?? existing.code,
			symbols: input.symbols ?? existing.symbols,
			timeframe: (input.timeframe ?? existing.timeframe) as CreateStrategyInput["timeframe"],
			direction: (input.direction ?? existing.direction) as CreateStrategyInput["direction"],
			featuresDefinition: (input.featuresDefinition ??
				existing.featuresDefinition) as CreateStrategyInput["featuresDefinition"],
			normalizationConfig: (input.normalizationConfig ??
				existing.normalizationConfig) as Record<string, unknown>,
			searchConfig: (input.searchConfig ?? existing.searchConfig) as Record<string, unknown>,
			resultConfig: (input.resultConfig ?? existing.resultConfig) as Record<string, unknown>,
			decisionConfig: (input.decisionConfig ?? existing.decisionConfig) as Record<string, unknown>,
			executionMode: (input.executionMode ?? existing.executionMode) as CreateStrategyInput["executionMode"],
			apiVersion: input.apiVersion ?? existing.apiVersion ?? undefined,
		};

		// The deps.create implementation should handle version incrementing
		// by setting version = existing.version + 1
		const row = await this.deps.create(createInput);
		return mapRowToStrategy(row);
	}
}
