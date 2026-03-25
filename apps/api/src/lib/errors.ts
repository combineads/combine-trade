import { Elysia } from "elysia";

export class ApiError extends Error {
	constructor(
		public readonly status: number,
		public readonly code: string,
		message: string,
	) {
		super(message);
		this.name = "ApiError";
	}
}

export class NotFoundError extends ApiError {
	constructor(message = "Resource not found") {
		super(404, "NOT_FOUND", message);
		this.name = "NotFoundError";
	}
}

export class ValidationError extends ApiError {
	constructor(message = "Validation failed") {
		super(422, "VALIDATION_ERROR", message);
		this.name = "ValidationError";
	}
}

export class UnauthorizedError extends ApiError {
	constructor(message = "Unauthorized") {
		super(401, "UNAUTHORIZED", message);
		this.name = "UnauthorizedError";
	}
}

export class ForbiddenError extends ApiError {
	constructor(message = "Forbidden") {
		super(403, "FORBIDDEN", message);
		this.name = "ForbiddenError";
	}
}

export class ConflictError extends ApiError {
	constructor(message = "Conflict") {
		super(409, "CONFLICT", message);
		this.name = "ConflictError";
	}
}

/** Error thrown when the readiness gate blocks a paper→live transition. */
export class ReadinessGateError extends ApiError {
	public readonly score: number;
	public readonly required: number;

	constructor(score: number, required: number) {
		super(422, "READINESS_GATE_FAILED", "Readiness score below required threshold");
		this.name = "ReadinessGateError";
		this.score = score;
		this.required = required;
	}
}

/** Check if an error is an ApiError (duck-typing for cross-module safety). */
function isApiError(error: unknown): error is ApiError {
	return error instanceof Error && "status" in error && "code" in error;
}

function isReadinessGateError(error: unknown): error is ReadinessGateError {
	return isApiError(error) && error.code === "READINESS_GATE_FAILED" && "score" in error;
}

export const errorHandlerPlugin = new Elysia({ name: "error-handler" }).onError(
	{ as: "global" },
	({ error, set }) => {
		set.headers["content-type"] = "application/json";
		if (isReadinessGateError(error)) {
			set.status = error.status;
			return JSON.stringify({
				error: {
					code: error.code,
					message: error.message,
					score: error.score,
					required: error.required,
				},
			});
		}
		if (isApiError(error)) {
			set.status = error.status;
			return JSON.stringify({ error: { code: error.code, message: error.message } });
		}
		set.status = 500;
		return JSON.stringify({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
	},
);
