import { FatalError } from "@combine/shared";
import { newQuickJSWASMModule } from "quickjs-emscripten";
import type { QuickJSContext, QuickJSRuntime, QuickJSWASMModule } from "quickjs-emscripten";
import type { StrategyAPIConfig } from "./api.js";
import { injectStrategyAPI } from "./api.js";

const DEFAULT_MEMORY_LIMIT = 128 * 1024 * 1024; // 128MB
const DEFAULT_TIMEOUT_MS = 500;

export interface SandboxOptions {
	memoryLimit?: number;
	timeoutMs?: number;
}

export interface SandboxResult {
	features: SandboxFeature[];
	entryCondition: boolean | null;
	exitCondition: boolean | null;
}

export interface SandboxFeature {
	name: string;
	value: number;
	normalization: { method: string; lookback?: number };
}

/**
 * QuickJS-based strategy sandbox.
 * Provides true isolation: no access to fs, net, process, require.
 * Timeout and memory limits enforced.
 */
export class StrategySandbox {
	private module: QuickJSWASMModule | null = null;
	private runtime: QuickJSRuntime | null = null;
	private context: QuickJSContext | null = null;
	private readonly memoryLimit: number;
	private readonly timeoutMs: number;

	constructor(options: SandboxOptions = {}) {
		this.memoryLimit = options.memoryLimit ?? DEFAULT_MEMORY_LIMIT;
		this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	}

	async initialize(): Promise<void> {
		this.module = await newQuickJSWASMModule();
		this.runtime = this.module.newRuntime();
		this.runtime.setMemoryLimit(this.memoryLimit);
	}

	/**
	 * Execute strategy code in an isolated sandbox.
	 * Returns extracted features and trade conditions.
	 */
	execute(
		code: string,
		globals: Record<string, unknown> = {},
		apiConfig?: StrategyAPIConfig,
	): SandboxResult {
		if (!this.module || !this.runtime) {
			throw new FatalError("ERR_FATAL_SANDBOX_NOT_INITIALIZED", "Sandbox not initialized");
		}

		const context = this.runtime.newContext();
		const features: SandboxFeature[] = [];
		let entryCondition: boolean | null = null;
		let exitCondition: boolean | null = null;

		try {
			// Inject globals
			this.injectGlobals(context, globals);

			// Inject candle data and indicator API if config provided
			if (apiConfig) {
				injectStrategyAPI(context, apiConfig);
			}

			// Inject Strategy API stubs (defineFeature, setEntry, setExit)
			this.injectStrategyAPI(
				context,
				features,
				(cond) => {
					entryCondition = cond;
				},
				(cond) => {
					exitCondition = cond;
				},
			);

			// Set up timeout
			const startTime = Date.now();
			const timeoutMs = this.timeoutMs;
			this.runtime.setInterruptHandler(() => Date.now() - startTime > timeoutMs);

			// Execute
			const result = context.evalCode(code);

			if (result.error) {
				const err = context.dump(result.error);
				result.error.dispose();

				if (err?.message === "interrupted") {
					if (Date.now() - startTime > timeoutMs) {
						throw new FatalError(
							"ERR_FATAL_SANDBOX_TIMEOUT",
							`Strategy execution exceeded ${timeoutMs}ms timeout`,
						);
					}
					// Memory limit also triggers "interrupted"
					throw new FatalError("ERR_FATAL_SANDBOX_OOM", "Strategy execution exceeded memory limit");
				}

				throw new FatalError(
					"ERR_FATAL_SANDBOX_ERROR",
					`Strategy execution error: ${err?.message ?? String(err)}`,
				);
			}

			result.value.dispose();
			return { features, entryCondition, exitCondition };
		} finally {
			context.dispose();
		}
	}

	dispose(): void {
		this.runtime?.dispose();
		this.runtime = null;
		this.module = null;
	}

	private injectGlobals(context: QuickJSContext, globals: Record<string, unknown>): void {
		for (const [key, value] of Object.entries(globals)) {
			const handle = this.marshalValue(context, value);
			context.setProp(context.global, key, handle);
			handle.dispose();
		}
	}

	private injectStrategyAPI(
		context: QuickJSContext,
		features: SandboxFeature[],
		onEntry: (cond: boolean) => void,
		onExit: (cond: boolean) => void,
	): void {
		// defineFeature(name, value, normalization)
		const defineFeatureFn = context.newFunction(
			"defineFeature",
			(nameHandle, valueHandle, normHandle) => {
				const name = context.dump(nameHandle) as string;
				const value = context.dump(valueHandle) as number;
				const normalization = context.dump(normHandle) as SandboxFeature["normalization"];
				features.push({ name, value, normalization: normalization ?? { method: "none" } });
			},
		);
		context.setProp(context.global, "defineFeature", defineFeatureFn);
		defineFeatureFn.dispose();

		// setEntry(condition)
		const setEntryFn = context.newFunction("setEntry", (condHandle) => {
			onEntry(context.dump(condHandle) as boolean);
		});
		context.setProp(context.global, "setEntry", setEntryFn);
		setEntryFn.dispose();

		// setExit(condition)
		const setExitFn = context.newFunction("setExit", (condHandle) => {
			onExit(context.dump(condHandle) as boolean);
		});
		context.setProp(context.global, "setExit", setExitFn);
		setExitFn.dispose();
	}

	private marshalValue(
		context: QuickJSContext,
		value: unknown,
	): ReturnType<QuickJSContext["newNumber"]> {
		if (value === null || value === undefined) {
			return context.undefined;
		}
		if (typeof value === "number") {
			return context.newNumber(value);
		}
		if (typeof value === "string") {
			return context.newString(value);
		}
		if (typeof value === "boolean") {
			return value ? context.true : context.false;
		}
		if (Array.isArray(value)) {
			const arr = context.newArray();
			for (let i = 0; i < value.length; i++) {
				const elem = this.marshalValue(context, value[i]);
				context.setProp(arr, i, elem);
				elem.dispose();
			}
			return arr;
		}
		if (typeof value === "object") {
			const obj = context.newObject();
			for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
				const prop = this.marshalValue(context, v);
				context.setProp(obj, k, prop);
				prop.dispose();
			}
			return obj;
		}
		return context.undefined;
	}
}
