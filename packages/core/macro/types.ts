export type ImpactLevel = "HIGH" | "MEDIUM" | "LOW";

export interface EconomicEvent {
	id: string;
	externalId: string;
	title: string;
	eventName: string;
	impact: ImpactLevel;
	scheduledAt: Date;
	newsCollected: boolean;
	newsCollectedAt: Date | null;
	createdAt: Date;
}

export interface NewsItem {
	id: string;
	externalId: string;
	headline: string;
	source: string;
	publishedAt: Date;
	tags: string[];
	economicEventId: string | null;
	createdAt: Date;
}

export interface MacroContext {
	entryEvents: EconomicEvent[];
	entryNews: NewsItem[];
	exitEvents: EconomicEvent[];
	exitNews: NewsItem[];
}

export interface CreateEconomicEventInput {
	externalId: string;
	title: string;
	eventName: string;
	impact: ImpactLevel;
	scheduledAt: Date;
}

export interface CreateNewsItemInput {
	externalId: string;
	headline: string;
	source: string;
	publishedAt: Date;
	tags: string[];
	economicEventId?: string;
}
