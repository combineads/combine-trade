export interface KnnResult {
	direction: string;
	winrate: number;
	expectancy: number;
	sampleCount: number;
	confidenceTier: string;
}

export interface RecentTrade {
	daysAgo: number;
	direction: string;
	result: string;
	pnlPercent: number;
	tags: string[];
}

export interface DecisionMacroContext {
	upcomingEvents: { name: string; impact: string; hoursUntil: number }[];
	recentNews: { headline: string; hoursAgo: number }[];
	highImpactNext24h: number;
}

export interface DecisionPromptInput {
	knnResult: KnnResult;
	currentFeatures: Record<string, number>;
	recentTrades: RecentTrade[];
	macroContext: DecisionMacroContext;
}

export interface LlmDecision {
	action: "CONFIRM" | "PASS" | "REDUCE_SIZE";
	reason: string;
	confidence: number;
	risk_factors: string[];
}

export function buildDecisionPrompt(input: DecisionPromptInput): string {
	const sections: string[] = [];

	sections.push(buildKnnSection(input.knnResult));
	sections.push(buildFeaturesSection(input.currentFeatures));
	sections.push(buildTradeHistorySection(input.recentTrades));
	sections.push(buildMacroSection(input.macroContext));
	sections.push(buildJudgmentRequest());

	return sections.join("\n\n");
}

function buildKnnSection(knn: KnnResult): string {
	return `[kNN 결과]
방향: ${knn.direction}
승률: ${knn.winrate}
기대수익: ${knn.expectancy}
유사 패턴 수: ${knn.sampleCount}
신뢰구간: ${knn.confidenceTier}`;
}

function buildFeaturesSection(features: Record<string, number>): string {
	const entries = Object.entries(features);
	if (entries.length === 0) {
		return "[현재 피처]\n피처 데이터 없음";
	}
	const lines = entries.map(([k, v]) => `${k}: ${v}`);
	return `[현재 피처]\n${lines.join(", ")}`;
}

function buildTradeHistorySection(trades: RecentTrade[]): string {
	if (trades.length === 0) {
		return "[최근 매매 이력]\n최근 매매 이력 없음";
	}
	const lines = trades.map(
		(t, i) =>
			`#${i + 1}: ${t.daysAgo}일 전 ${t.direction} → ${t.result} (${t.pnlPercent > 0 ? "+" : ""}${t.pnlPercent}%), ${t.tags.join(", ")}`,
	);
	return `[최근 매매 이력 ${trades.length}건]\n${lines.join("\n")}`;
}

function buildMacroSection(ctx: DecisionMacroContext): string {
	const parts: string[] = [];

	if (ctx.upcomingEvents.length === 0) {
		parts.push("예정된 경제 이벤트 없음");
	} else {
		for (const evt of ctx.upcomingEvents) {
			const dir = evt.hoursUntil >= 0 ? `D+${evt.hoursUntil}h` : `${evt.hoursUntil}h`;
			parts.push(`- ${evt.name} (${evt.impact}) ${dir}`);
		}
	}

	if (ctx.recentNews.length > 0) {
		for (const news of ctx.recentNews) {
			parts.push(`- ${news.hoursAgo}시간 전 뉴스: "${news.headline}"`);
		}
	}

	if (ctx.highImpactNext24h > 0) {
		parts.push(`- 24시간 내 ★★★ 이벤트 ${ctx.highImpactNext24h}건`);
	}

	return `[현재 매크로]\n${parts.join("\n")}`;
}

function buildJudgmentRequest(): string {
	return `[판단 요청]
위 정보를 종합하여 진입 여부를 판단하세요.
반드시 아래 JSON 형식으로만 응답:
{ "action": "CONFIRM"|"PASS"|"REDUCE_SIZE", "reason": "한국어 2~3문장", "confidence": 0.0-1.0, "risk_factors": ["factor1", "factor2"] }`;
}
