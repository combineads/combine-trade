import { Elysia, t } from "elysia";
import type { StrategyRepository } from "../../../../packages/core/strategy/repository.js";
import { ExecutionModeService } from "../../../../packages/execution/mode.js";
import type { ExecutionModeDeps } from "../../../../packages/execution/types.js";
import { ModeTransitionError } from "../../../../packages/execution/types.js";
import { NotFoundError, ValidationError } from "../lib/errors.js";
import { ok } from "../lib/response.js";

export interface StrategyRouteDeps {
	strategyRepository: StrategyRepository;
	executionModeDeps: ExecutionModeDeps;
}

export function strategyRoutes(deps: StrategyRouteDeps) {
	const modeService = new ExecutionModeService(deps.executionModeDeps);

	return new Elysia({ prefix: "/api/v1/strategies" })
		.get("/", async () => {
			const strategies = await deps.strategyRepository.findAll();
			return ok(strategies);
		})
		.get(
			"/:id",
			async ({ params }) => {
				const strategy = await deps.strategyRepository.findById(params.id);
				if (!strategy) throw new NotFoundError(`Strategy ${params.id} not found`);
				return ok(strategy);
			},
			{
				params: t.Object({ id: t.String() }),
			},
		)
		.post(
			"/",
			async ({ body }) => {
				const strategy = await deps.strategyRepository.create(body);
				return ok(strategy);
			},
			{
				body: t.Object({
					name: t.String(),
					code: t.String(),
					symbols: t.Array(t.String()),
					timeframe: t.String(),
					direction: t.Union([t.Literal("long"), t.Literal("short"), t.Literal("both")]),
					featuresDefinition: t.Array(
						t.Object({
							name: t.String(),
							expression: t.String(),
							normalization: t.Object({
								method: t.Union([
									t.Literal("minmax"),
									t.Literal("zscore"),
									t.Literal("rank"),
									t.Literal("none"),
								]),
								lookback: t.Optional(t.Number()),
							}),
						}),
					),
					normalizationConfig: t.Optional(t.Record(t.String(), t.Unknown())),
					searchConfig: t.Optional(t.Record(t.String(), t.Unknown())),
					resultConfig: t.Optional(t.Record(t.String(), t.Unknown())),
					decisionConfig: t.Optional(t.Record(t.String(), t.Unknown())),
					description: t.Optional(t.String()),
					executionMode: t.Optional(
						t.Union([t.Literal("analysis"), t.Literal("paper"), t.Literal("live")]),
					),
				}),
			},
		)
		.put(
			"/:id",
			async ({ params, body }) => {
				const existing = await deps.strategyRepository.findById(params.id);
				if (!existing) throw new NotFoundError(`Strategy ${params.id} not found`);
				const updated = await deps.strategyRepository.update(params.id, body);
				return ok(updated);
			},
			{
				params: t.Object({ id: t.String() }),
				body: t.Object({
					name: t.Optional(t.String()),
					description: t.Optional(t.String()),
					code: t.Optional(t.String()),
					symbols: t.Optional(t.Array(t.String())),
					timeframe: t.Optional(t.String()),
					direction: t.Optional(
						t.Union([t.Literal("long"), t.Literal("short"), t.Literal("both")]),
					),
					featuresDefinition: t.Optional(
						t.Array(
							t.Object({
								name: t.String(),
								expression: t.String(),
								normalization: t.Object({
									method: t.Union([
										t.Literal("minmax"),
										t.Literal("zscore"),
										t.Literal("rank"),
										t.Literal("none"),
									]),
									lookback: t.Optional(t.Number()),
								}),
							}),
						),
					),
					normalizationConfig: t.Optional(t.Record(t.String(), t.Unknown())),
					searchConfig: t.Optional(t.Record(t.String(), t.Unknown())),
					resultConfig: t.Optional(t.Record(t.String(), t.Unknown())),
					decisionConfig: t.Optional(t.Record(t.String(), t.Unknown())),
					executionMode: t.Optional(
						t.Union([t.Literal("analysis"), t.Literal("paper"), t.Literal("live")]),
					),
				}),
			},
		)
		.put(
			"/:id/mode",
			async ({ params, body }) => {
				const existing = await deps.strategyRepository.findById(params.id);
				if (!existing) throw new NotFoundError(`Strategy ${params.id} not found`);
				try {
					await modeService.setMode(params.id, body.mode);
				} catch (err) {
					if (err instanceof ModeTransitionError) {
						throw new ValidationError(err.message);
					}
					throw err;
				}
				return ok({ strategyId: params.id, mode: body.mode });
			},
			{
				params: t.Object({ id: t.String() }),
				body: t.Object({
					mode: t.Union([
						t.Literal("analysis"),
						t.Literal("alert"),
						t.Literal("paper"),
						t.Literal("live"),
					]),
				}),
			},
		);
}
