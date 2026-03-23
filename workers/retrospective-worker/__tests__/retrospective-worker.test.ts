import { describe, expect, mock, test } from "bun:test";
import type { RetrospectivePromptInput } from "@combine/core/macro/prompt-builder.js";
import {
	type RetrospectiveRepository,
	RetrospectiveWorker,
	type SpawnRunner,
} from "../src/index.js";

function makeJournalContext(): RetrospectivePromptInput {
	return {
		strategyName: "BTC-RSI",
		symbol: "BTCUSDT",
		direction: "LONG",
		timeframe: "1h",
		entryPrice: 65000,
		exitPrice: 64200,
		pnlPercent: -1.23,
		result: "LOSS",
		holdBars: 5,
		winrate: 0.62,
		expectancy: 0.42,
		sampleCount: 47,
		confidenceTier: "HIGH",
		features: { RSI: 38 },
		mfePercent: 0.8,
		maePercent: -1.5,
		macroContext: {
			entryEvents: [],
			entryNews: [],
			exitEvents: [],
			exitNews: [],
		},
	};
}

function createMockRepo(
	context: RetrospectivePromptInput | null = makeJournalContext(),
): RetrospectiveRepository {
	return {
		getJournalWithContext: mock(async (_id: string) => context),
		saveReport: mock(async (_id: string, _report: string) => {}),
	};
}

function createMockSpawn(output: string): SpawnRunner {
	return mock(async () => output);
}

function createFailingSpawn(error: Error): SpawnRunner {
	return mock(async () => {
		throw error;
	});
}

describe("RetrospectiveWorker", () => {
	test("generates and saves report on success", async () => {
		const repo = createMockRepo();
		const spawn = createMockSpawn("LLM 회고 리포트 내용입니다.");
		const worker = new RetrospectiveWorker({ repository: repo, spawn });

		await worker.processJournal("journal-1");

		expect(repo.getJournalWithContext).toHaveBeenCalledTimes(1);
		expect(spawn).toHaveBeenCalledTimes(1);
		expect(repo.saveReport).toHaveBeenCalledTimes(1);
		const [id, report] = (repo.saveReport as ReturnType<typeof mock>).mock.calls[0] as [
			string,
			string,
		];
		expect(id).toBe("journal-1");
		expect(report).toBe("LLM 회고 리포트 내용입니다.");
	});

	test("skips when journal not found", async () => {
		const repo = createMockRepo(null);
		const spawn = createMockSpawn("output");
		const worker = new RetrospectiveWorker({ repository: repo, spawn });

		await worker.processJournal("nonexistent");

		expect(spawn).toHaveBeenCalledTimes(0);
		expect(repo.saveReport).toHaveBeenCalledTimes(0);
	});

	test("handles spawn failure gracefully", async () => {
		const repo = createMockRepo();
		const spawn = createFailingSpawn(new Error("claude not found"));
		const worker = new RetrospectiveWorker({ repository: repo, spawn });

		await worker.processJournal("journal-1");

		expect(repo.saveReport).toHaveBeenCalledTimes(0);
	});

	test("does not save empty output", async () => {
		const repo = createMockRepo();
		const spawn = createMockSpawn("");
		const worker = new RetrospectiveWorker({ repository: repo, spawn });

		await worker.processJournal("journal-1");

		expect(repo.saveReport).toHaveBeenCalledTimes(0);
	});

	test("does not save whitespace-only output", async () => {
		const repo = createMockRepo();
		const spawn = createMockSpawn("   \n  ");
		const worker = new RetrospectiveWorker({ repository: repo, spawn });

		await worker.processJournal("journal-1");

		expect(repo.saveReport).toHaveBeenCalledTimes(0);
	});

	test("passes prompt string to spawn runner", async () => {
		const repo = createMockRepo();
		const spawn = createMockSpawn("report");
		const worker = new RetrospectiveWorker({ repository: repo, spawn });

		await worker.processJournal("journal-1");

		const promptArg = (spawn as ReturnType<typeof mock>).mock.calls[0][0] as string;
		expect(promptArg).toContain("BTC-RSI");
		expect(promptArg).toContain("한국어");
	});
});
