import {
	type RetrospectivePromptInput,
	buildRetrospectivePrompt,
} from "@combine/core/macro/prompt-builder.js";

export type SpawnRunner = (prompt: string) => Promise<string>;

export interface RetrospectiveRepository {
	getJournalWithContext(journalId: string): Promise<RetrospectivePromptInput | null>;
	saveReport(journalId: string, report: string): Promise<void>;
}

export interface RetrospectiveWorkerDeps {
	repository: RetrospectiveRepository;
	spawn: SpawnRunner;
}

export class RetrospectiveWorker {
	private readonly repository: RetrospectiveRepository;
	private readonly spawn: SpawnRunner;

	constructor(deps: RetrospectiveWorkerDeps) {
		this.repository = deps.repository;
		this.spawn = deps.spawn;
	}

	async processJournal(journalId: string): Promise<void> {
		const context = await this.repository.getJournalWithContext(journalId);
		if (!context) {
			console.warn(`Journal ${journalId} not found, skipping retrospective`);
			return;
		}

		const prompt = buildRetrospectivePrompt(context);

		let output: string;
		try {
			output = await this.spawn(prompt);
		} catch (err) {
			console.warn(`Retrospective generation failed for ${journalId}:`, err);
			return;
		}

		if (!output.trim()) {
			console.warn(`Empty retrospective output for ${journalId}`);
			return;
		}

		await this.repository.saveReport(journalId, output);
	}
}
