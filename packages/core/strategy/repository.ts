import type { CreateStrategyInput, Strategy, UpdateStrategyInput } from "./types.js";

/**
 * Strategy repository interface.
 * packages/core must NOT import Drizzle — concrete implementations live in workers.
 */
export interface StrategyRepository {
	create(input: CreateStrategyInput): Promise<Strategy>;
	findById(id: string): Promise<Strategy | null>;
	findByNameAndVersion(name: string, version: number): Promise<Strategy | null>;
	findActive(): Promise<Strategy[]>;
	findAll(): Promise<Strategy[]>;
	update(id: string, input: UpdateStrategyInput): Promise<Strategy>;
	softDelete(id: string): Promise<void>;
	createNewVersion(id: string, input: UpdateStrategyInput): Promise<Strategy>;
}
