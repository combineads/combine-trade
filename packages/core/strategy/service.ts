import { UserError } from "@combine/shared";
import type { StrategyRepository } from "./repository.js";
import type { CreateStrategyInput, Strategy, UpdateStrategyInput } from "./types.js";
import { validateStrategyCode } from "./validation.js";

/**
 * Strategy CRUD service.
 * Validates inputs before delegating to the repository.
 * All methods accept a userId parameter for repository-level isolation.
 */
export class StrategyCrudService {
	constructor(private readonly repository: StrategyRepository) {}

	async create(input: CreateStrategyInput, userId: string): Promise<Strategy> {
		this.validateFeatures(input.featuresDefinition);
		this.validateCode(input.code);
		return this.repository.create(input, userId);
	}

	async findById(id: string, userId: string): Promise<Strategy | null> {
		return this.repository.findById(id, userId);
	}

	async findActive(userId: string): Promise<Strategy[]> {
		return this.repository.findActive(userId);
	}

	async findAll(userId: string): Promise<Strategy[]> {
		return this.repository.findAll(userId);
	}

	async update(id: string, input: UpdateStrategyInput, userId: string): Promise<Strategy> {
		if (input.featuresDefinition) {
			this.validateFeatures(input.featuresDefinition);
		}
		if (input.code) {
			this.validateCode(input.code);
		}
		return this.repository.update(id, input, userId);
	}

	/**
	 * Create a new version of a strategy.
	 * The old version is preserved (immutable). A new record is created with version + 1.
	 */
	async createNewVersion(
		id: string,
		input: UpdateStrategyInput,
		userId: string,
	): Promise<Strategy> {
		if (input.featuresDefinition) {
			this.validateFeatures(input.featuresDefinition);
		}
		if (input.code) {
			this.validateCode(input.code);
		}
		return this.repository.createNewVersion(id, input, userId);
	}

	async softDelete(id: string, userId: string): Promise<void> {
		return this.repository.softDelete(id, userId);
	}

	private validateCode(code: string): void {
		const result = validateStrategyCode(code);
		if (!result.valid) {
			const messages = result.errors.map((e) => `${e.code}: ${e.message}`).join("; ");
			throw new UserError("ERR_USER_INVALID_CODE", `Strategy code validation failed: ${messages}`);
		}
	}

	private validateFeatures(features: CreateStrategyInput["featuresDefinition"]): void {
		if (!features || features.length === 0) {
			throw new UserError(
				"ERR_USER_FEATURES_REQUIRED",
				"At least one feature definition is required",
			);
		}
		for (const f of features) {
			if (!f.name || !f.expression) {
				throw new UserError(
					"ERR_USER_INVALID_FEATURE",
					`Feature must have name and expression: ${JSON.stringify(f)}`,
				);
			}
		}
	}
}
