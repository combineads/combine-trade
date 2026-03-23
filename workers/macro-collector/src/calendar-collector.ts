import { shouldCollect } from "@combine/core/macro/impact-parser.js";
import type { CreateEconomicEventInput } from "@combine/core/macro/types.js";

export interface CalendarEventRepository {
	upsertByExternalId(input: CreateEconomicEventInput): Promise<void>;
}

export interface CalendarCollectorDeps {
	fetchEvents: (start: Date, end: Date) => Promise<CreateEconomicEventInput[]>;
	repository: CalendarEventRepository;
}

export class CalendarCollector {
	private readonly fetchEvents: CalendarCollectorDeps["fetchEvents"];
	private readonly repository: CalendarEventRepository;

	constructor(deps: CalendarCollectorDeps) {
		this.fetchEvents = deps.fetchEvents;
		this.repository = deps.repository;
	}

	async collect(): Promise<void> {
		const start = new Date();
		const end = new Date();
		end.setDate(end.getDate() + 7);

		let events: CreateEconomicEventInput[];
		try {
			events = await this.fetchEvents(start, end);
		} catch (err) {
			console.warn("Calendar collection failed:", err);
			return;
		}

		const collectible = events.filter((e) => shouldCollect(e.impact));

		for (const event of collectible) {
			await this.repository.upsertByExternalId(event);
		}
	}
}
