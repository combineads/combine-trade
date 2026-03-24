/**
 * Trading domain glossary — consistent term mapping between Korean and English.
 * LONG, SHORT, PASS remain in English in both locales (domain standard).
 */

export interface GlossaryEntry {
	en: string;
	ko: string;
	koAlt?: string[];
}

export interface GlossaryCategory {
	id: string;
	label: string;
	labelKo: string;
	entries: GlossaryEntry[];
}

export const GLOSSARY_CATEGORIES: GlossaryCategory[] = [
	{
		id: "general",
		label: "General Trading",
		labelKo: "일반 트레이딩",
		entries: [
			{ en: "LONG", ko: "LONG" },
			{ en: "SHORT", ko: "SHORT" },
			{ en: "PASS", ko: "PASS" },
			{ en: "Long Position", ko: "롱 포지션", koAlt: ["매수 포지션"] },
			{ en: "Short Position", ko: "숏 포지션", koAlt: ["매도 포지션"] },
			{ en: "Position", ko: "포지션" },
			{ en: "Order", ko: "주문" },
			{ en: "Trade", ko: "거래", koAlt: ["매매"] },
			{ en: "Entry", ko: "진입" },
			{ en: "Exit", ko: "청산", koAlt: ["탈출"] },
			{ en: "PnL", ko: "손익", koAlt: ["수익/손실"] },
			{ en: "Balance", ko: "잔고", koAlt: ["잔액"] },
			{ en: "Candle", ko: "캔들", koAlt: ["봉"] },
			{ en: "Symbol", ko: "심볼", koAlt: ["종목"] },
			{ en: "Timeframe", ko: "타임프레임", koAlt: ["시간봉"] },
		],
	},
	{
		id: "orderTypes",
		label: "Order Types",
		labelKo: "주문 유형",
		entries: [
			{ en: "Market Order", ko: "시장가 주문" },
			{ en: "Limit Order", ko: "지정가 주문" },
			{ en: "Stop Market", ko: "스탑 시장가" },
			{ en: "Stop Limit", ko: "스탑 지정가" },
			{ en: "Take Profit", ko: "익절", koAlt: ["이익실현", "TP"] },
			{ en: "Stop Loss", ko: "손절", koAlt: ["손실제한", "SL"] },
			{ en: "Trailing Stop", ko: "추적 손절", koAlt: ["트레일링 스탑"] },
		],
	},
	{
		id: "riskManagement",
		label: "Risk Management",
		labelKo: "리스크 관리",
		entries: [
			{ en: "Kill Switch", ko: "킬 스위치", koAlt: ["긴급 중지"] },
			{ en: "Daily Loss Limit", ko: "일간 손실 한도" },
			{ en: "Liquidation", ko: "청산", koAlt: ["강제 청산"] },
			{ en: "Leverage", ko: "레버리지" },
			{ en: "Margin", ko: "마진", koAlt: ["증거금"] },
			{ en: "Exposure", ko: "노출", koAlt: ["익스포저"] },
			{ en: "Risk Gate", ko: "리스크 게이트" },
			{ en: "Position Sizing", ko: "포지션 사이징" },
			{ en: "Max Drawdown", ko: "최대 낙폭", koAlt: ["최대 드로다운"] },
		],
	},
	{
		id: "technicalAnalysis",
		label: "Technical Analysis",
		labelKo: "기술적 분석",
		entries: [
			{ en: "SMA", ko: "단순 이동평균", koAlt: ["SMA"] },
			{ en: "EMA", ko: "지수 이동평균", koAlt: ["EMA"] },
			{ en: "Bollinger Bands", ko: "볼린저 밴드" },
			{ en: "RSI", ko: "상대강도지수", koAlt: ["RSI"] },
			{ en: "MACD", ko: "MACD" },
			{ en: "ATR", ko: "평균진폭", koAlt: ["ATR"] },
			{ en: "Stochastic", ko: "스토캐스틱" },
			{ en: "Support", ko: "지지", koAlt: ["지지선"] },
			{ en: "Resistance", ko: "저항", koAlt: ["저항선"] },
			{ en: "Indicator", ko: "지표" },
		],
	},
	{
		id: "positionManagement",
		label: "Position Management",
		labelKo: "포지션 관리",
		entries: [
			{ en: "Filled", ko: "체결" },
			{ en: "Partially Filled", ko: "부분 체결" },
			{ en: "Cancelled", ko: "취소됨" },
			{ en: "Submitted", ko: "접수됨" },
			{ en: "Rejected", ko: "거부됨" },
			{ en: "Slippage", ko: "슬리피지" },
			{ en: "Paper Trading", ko: "모의매매", koAlt: ["페이퍼 트레이딩"] },
			{ en: "Live Trading", ko: "실매매", koAlt: ["실거래"] },
			{ en: "Backtest", ko: "백테스트" },
		],
	},
	{
		id: "systemComponents",
		label: "System Components",
		labelKo: "시스템 구성요소",
		entries: [
			{ en: "Strategy", ko: "전략" },
			{ en: "Decision Engine", ko: "의사결정 엔진" },
			{ en: "Vector Search", ko: "벡터 검색" },
			{ en: "Pipeline", ko: "파이프라인" },
			{ en: "Worker", ko: "워커" },
			{ en: "Sandbox", ko: "샌드박스" },
			{ en: "Exchange Adapter", ko: "거래소 어댑터" },
			{ en: "Alert", ko: "알림" },
			{ en: "Event Bus", ko: "이벤트 버스" },
			{ en: "Supervisor", ko: "수퍼바이저" },
			{ en: "Dashboard", ko: "대시보드" },
			{ en: "Strategies", ko: "전략" },
		],
	},
	{
		id: "statistics",
		label: "Statistics",
		labelKo: "통계",
		entries: [
			{ en: "Win Rate", ko: "승률" },
			{ en: "Expectancy", ko: "기대값" },
			{ en: "Sharpe Ratio", ko: "샤프 비율" },
			{ en: "Profit Factor", ko: "수익 팩터" },
			{ en: "Consecutive Losses", ko: "연속 손실" },
			{ en: "Consecutive Wins", ko: "연속 이익" },
			{ en: "Edge Ratio", ko: "엣지 비율" },
			{ en: "MFE", ko: "최대 유리 편차", koAlt: ["MFE"] },
			{ en: "MAE", ko: "최대 불리 편차", koAlt: ["MAE"] },
			{ en: "Risk Reward", ko: "위험보상비율" },
		],
	},
	{
		id: "domainStandard",
		label: "Domain Standard Terms",
		labelKo: "도메인 표준 용어",
		entries: [
			{ en: "OHLCV", ko: "OHLCV" },
			{ en: "HNSW", ko: "HNSW" },
			{ en: "L2 Distance", ko: "L2 거리" },
			{ en: "kNN", ko: "kNN" },
			{ en: "Vectorization", ko: "벡터화" },
			{ en: "Embedding", ko: "임베딩" },
			{ en: "Feature", ko: "피처", koAlt: ["특성"] },
			{ en: "Dimension", ko: "차원" },
			{ en: "Similarity", ko: "유사도" },
			{ en: "Normalization", ko: "정규화" },
		],
	},
];

/** Flat lookup map: English term -> GlossaryEntry */
export const GLOSSARY_BY_ENGLISH: Readonly<Record<string, GlossaryEntry>> =
	Object.freeze(
		GLOSSARY_CATEGORIES.reduce(
			(map, cat) => {
				for (const entry of cat.entries) {
					map[entry.en] = entry;
				}
				return map;
			},
			{} as Record<string, GlossaryEntry>,
		),
	);

/** Look up Korean translation by English term. Returns the English term if not found. */
export function lookupKo(en: string): string {
	return GLOSSARY_BY_ENGLISH[en]?.ko ?? en;
}

/** Reverse lookup: Korean -> English. Checks both primary ko and koAlt. */
export function lookupEn(ko: string): string | undefined {
	for (const entry of Object.values(GLOSSARY_BY_ENGLISH)) {
		if (entry.ko === ko) return entry.en;
		if (entry.koAlt?.includes(ko)) return entry.en;
	}
	return undefined;
}

/** Terms that remain in English in both locales (domain standard). */
export const UNTRANSLATED_TERMS = ["LONG", "SHORT", "PASS", "PnL"] as const;

function toCamelCase(s: string): string {
	return s
		.split(" ")
		.map((w, i) =>
			i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1),
		)
		.join("");
}

/** Korean term mapping (camelCase key -> Korean value). */
export const KO_TERMS: Record<string, string> = {};
/** English term mapping (camelCase key -> English value). */
export const EN_TERMS: Record<string, string> = {};

for (const entry of Object.values(GLOSSARY_BY_ENGLISH)) {
	const key = toCamelCase(entry.en);
	KO_TERMS[key] = entry.ko;
	EN_TERMS[key] = entry.en;
}

export type Locale = "ko" | "en";
export type GlossaryTerm = string;

/** Legacy compat: simple GLOSSARY object */
export const GLOSSARY = {
	LONG: "LONG" as const,
	SHORT: "SHORT" as const,
	PASS: "PASS" as const,
	ko: { ...KO_TERMS },
	en: { ...EN_TERMS },
} as const;
