import type { MacroContext } from "./types.js";

export interface RetrospectivePromptInput {
	strategyName: string;
	symbol: string;
	direction: string;
	timeframe: string;
	entryPrice: number;
	exitPrice: number;
	pnlPercent: number;
	result: string;
	holdBars: number;
	winrate: number;
	expectancy: number;
	sampleCount: number;
	confidenceTier: string;
	features: Record<string, number>;
	mfePercent: number;
	maePercent: number;
	macroContext: MacroContext;
}

export function buildRetrospectivePrompt(
	input: RetrospectivePromptInput,
): string {
	const sections: string[] = [];

	sections.push(buildStrategySection(input));
	sections.push(buildTradeResultSection(input));
	sections.push(buildDecisionBasisSection(input));
	sections.push(buildFeaturesSection(input.features));
	sections.push(buildMfeMaeSection(input));
	sections.push(buildMacroEventsSection(input.macroContext));
	sections.push(buildNewsSection(input.macroContext));
	sections.push(buildAnalysisRequest());

	return sections.join("\n\n");
}

function buildStrategySection(input: RetrospectivePromptInput): string {
	return `[전략 정보]
전략명: ${input.strategyName}
심볼: ${input.symbol}
방향: ${input.direction}
타임프레임: ${input.timeframe}`;
}

function buildTradeResultSection(input: RetrospectivePromptInput): string {
	return `[매매 결과]
진입가: ${input.entryPrice}
청산가: ${input.exitPrice}
PnL: ${input.pnlPercent}%
결과: ${input.result}
보유 봉수: ${input.holdBars}`;
}

function buildDecisionBasisSection(input: RetrospectivePromptInput): string {
	return `[의사결정 근거]
승률: ${input.winrate}
기대수익: ${input.expectancy}
유사 패턴 수: ${input.sampleCount}
신뢰구간: ${input.confidenceTier}`;
}

function buildFeaturesSection(features: Record<string, number>): string {
	const entries = Object.entries(features);
	if (entries.length === 0) {
		return "[기술 지표]\n지표 데이터 없음";
	}
	const lines = entries.map(([key, val]) => `${key}: ${val}`);
	return `[기술 지표]\n${lines.join("\n")}`;
}

function buildMfeMaeSection(input: RetrospectivePromptInput): string {
	return `[MFE/MAE]
MFE (최대 유리 이동): ${input.mfePercent}%
MAE (최대 불리 이동): ${input.maePercent}%`;
}

function buildMacroEventsSection(ctx: MacroContext): string {
	const allEvents = [...ctx.entryEvents, ...ctx.exitEvents];
	if (allEvents.length === 0) {
		return "[경제 이벤트]\n경제 이벤트 없음";
	}
	const lines = allEvents.map(
		(e) =>
			`- ${e.eventName} (${e.impact}) @ ${e.scheduledAt.toISOString()}`,
	);
	return `[경제 이벤트]\n${lines.join("\n")}`;
}

function buildNewsSection(ctx: MacroContext): string {
	const allNews = [...ctx.entryNews, ...ctx.exitNews];
	if (allNews.length === 0) {
		return "[주요 뉴스]\n관련 뉴스 없음";
	}
	const lines = allNews.map(
		(n) =>
			`- "${n.headline}" (${n.source}) @ ${n.publishedAt.toISOString()}`,
	);
	return `[주요 뉴스]\n${lines.join("\n")}`;
}

function buildAnalysisRequest(): string {
	return `[분석 요청]
위 정보를 종합하여 이 매매를 한국어로 회고 분석해주세요.
다음을 포함해주세요:
1. 진입 타이밍의 적절성 (매크로 이벤트 대비)
2. 손익에 영향을 준 핵심 요인
3. 개선할 수 있었던 점
4. 유사 상황에서의 향후 전략 제안`;
}
