export interface AlertContext {
	strategyName: string;
	symbol: string;
	timeframe: string;
	entryPrice: string;
	tp: string;
	sl: string;
	topSimilarity: number;
}

export interface HeaderBlock {
	type: "header";
	text: { type: "plain_text"; text: string };
}

export interface SectionBlock {
	type: "section";
	text: { type: "mrkdwn"; text: string };
}

export interface DividerBlock {
	type: "divider";
}

export type SlackBlock = HeaderBlock | SectionBlock | DividerBlock;

export interface SlackMessage {
	blocks: SlackBlock[];
}
