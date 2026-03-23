import type { CreateStrategyInput, Strategy, UpdateStrategyInput } from "./types.js";

/**
 * Strategy repository interface.
 * packages/core must NOT import Drizzle — concrete implementations live in workers.
 *
 * Every method that reads or writes user-owned records requires a userId parameter.
 * Repository methods return null (not 403/404) for not-found-or-wrong-user;
 * the route layer converts null → 404 to avoid existence disclosure.
 */
export interface StrategyRepository {
	create(input: CreateStrategyInput, userId: string): Promise<Strategy>;
	findById(id: string, userId: string): Promise<Strategy | null>;
	findByNameAndVersion(name: string, version: number, userId: string): Promise<Strategy | null>;
	findActive(userId: string): Promise<Strategy[]>;
	findAll(userId: string): Promise<Strategy[]>;
	update(id: string, input: UpdateStrategyInput, userId: string): Promise<Strategy>;
	softDelete(id: string, userId: string): Promise<void>;
	createNewVersion(id: string, input: UpdateStrategyInput, userId: string): Promise<Strategy>;
}
