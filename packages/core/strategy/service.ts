import { UserError } from "@combine/shared";
import type { StrategyRepository } from "./repository.js";
import type { CreateStrategyInput, Strategy, UpdateStrategyInput } from "./types.js";
import { validateStrategyCode } from "./validation.js";

/**
 * Strategy CRUD service.
 * Validates inputs before delegating to the repository.
 */
export class StrategyCrudService {
	constructor(private readonly repository: StrategyRepository) {}

	async create(input: CreateStrategyInput): Promise<Strategy> {
		this.validateFeatures(input.featuresDefinition);
		this.validateCode(input.code);
		return this.repository.create(input);
	}

	async findById(id: string): Promise<Strategy | null> {
		return this.repository.findById(id);
	}

	async findActive(): Promise<Strategy[]> {
		return this.repository.findActive();
	}

	async findAll(): Promise<Strategy[]> {
		return this.repository.findAll();
	}

	async update(id: string, input: UpdateStrategyInput): Promise<Strategy> {
		if (input.featuresDefinition) {
			this.validateFeatures(input.featuresDefinition);
		}
		if (input.code) {
			this.validateCode(input.code);
		}
		return this.repository.update(id, input);
	}

	/**
	 * Create a new version of a strategy.
	 * The old version is preserved (immutable). A new record is created with version + 1.
	 */
	async createNewVersion(id: string, input: UpdateStrategyInput): Promise<Strategy> {
		if (input.featuresDefinition) {
			this.validateFeatures(input.featuresDefinition);
		}
		if (input.code) {
			this.validateCode(input.code);
		}
		return this.repository.createNewVersion(id, input);
	}

	async softDelete(id: string): Promise<void> {
		return this.repository.softDelete(id);
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
