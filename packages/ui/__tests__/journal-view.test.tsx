import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import { JournalView } from "../src/views/journal/journal-view";
import { JournalEntryDetail } from "../src/views/journal/journal-entry-detail";
import { JournalStats } from "../src/views/journal/journal-stats";
import { JournalComparison } from "../src/views/journal/journal-comparison";
import { JournalFilters } from "../src/views/journal/journal-filters";
import type { JournalEntry, JournalStatsData } from "../src/views/journal/types";

const sampleEntry: JournalEntry = {
	id: "j1",
	tradeDate: "2026-03-20",
	symbol: "BTCUSDT",
	side: "LONG",
	entryPrice: 65000,
	exitPrice: 66500,
	pnl: 1500,
	duration: "4h 23m",
	strategyName: "Double-BB v2",
	tags: ["trend-follow", "breakout"],
	notes: "Strong volume confirmation",
	entryReason: "BB squeeze breakout",
	exitReason: "Take profit hit",
	mfe: 1800,
	mae: -200,
	riskReward: 3.0,
	edgeRatio: 1.234,
};

const sampleStats: JournalStatsData = {
	totalTrades: 42,
	winRate: 0.6667,
	avgPnl: 350.5,
	totalPnl: 14721,
};

describe("JournalView — ko locale (default)", () => {
	test("renders Korean page title", () => {
		const html = renderToString(
			<JournalView entries={[]} total={0} page={1} pageSize={20} />,
		);
		expect(html).toContain("트레이드 저널");
	});

	test("renders empty state in Korean", () => {
		const html = renderToString(
			<JournalView entries={[]} total={0} page={1} pageSize={20} />,
		);
		expect(html).toContain("저널 항목이 없습니다");
	});

	test("renders Korean column headers", () => {
		const html = renderToString(
			<JournalView entries={[sampleEntry]} total={1} page={1} pageSize={20} />,
		);
		expect(html).toContain("날짜");
		expect(html).toContain("심볼");
		expect(html).toContain("방향");
		expect(html).toContain("진입가");
		expect(html).toContain("청산가");
		expect(html).toContain("손익");
		expect(html).toContain("기간");
		expect(html).toContain("전략");
		expect(html).toContain("태그");
	});

	test("renders entry data", () => {
		const html = renderToString(
			<JournalView entries={[sampleEntry]} total={1} page={1} pageSize={20} />,
		);
		expect(html).toContain("BTCUSDT");
		expect(html).toContain("LONG");
		expect(html).toContain("65000.00");
		expect(html).toContain("66500.00");
		// React SSR may inject HTML comment nodes between concatenated text
		expect(html).toContain("1500.00");
		expect(html).toContain("Double-BB v2");
		expect(html).toContain("trend-follow");
		expect(html).toContain("breakout");
	});

	test("renders pagination buttons when total > pageSize", () => {
		const html = renderToString(
			<JournalView
				entries={[sampleEntry]}
				total={50}
				page={2}
				pageSize={20}
				onPageChange={() => {}}
			/>,
		);
		expect(html).toContain("이전");
		expect(html).toContain("다음");
	});
});

describe("JournalView — en locale", () => {
	test("renders English page title", () => {
		const html = renderToString(
			<JournalView entries={[]} total={0} page={1} pageSize={20} locale="en" />,
		);
		expect(html).toContain("Trade Journal");
	});

	test("renders empty state in English", () => {
		const html = renderToString(
			<JournalView entries={[]} total={0} page={1} pageSize={20} locale="en" />,
		);
		expect(html).toContain("No journal entries");
	});

	test("renders English column headers", () => {
		const html = renderToString(
			<JournalView entries={[sampleEntry]} total={1} page={1} pageSize={20} locale="en" />,
		);
		expect(html).toContain("Date");
		expect(html).toContain("Symbol");
		expect(html).toContain("Side");
		expect(html).toContain("Entry Price");
		expect(html).toContain("Exit Price");
		expect(html).toContain("PnL");
		expect(html).toContain("Duration");
		expect(html).toContain("Strategy");
		expect(html).toContain("Tags");
	});
});

describe("JournalFilters", () => {
	test("renders Korean filter labels by default", () => {
		const html = renderToString(<JournalFilters />);
		expect(html).toContain("날짜 범위");
		expect(html).toContain("심볼 필터");
		expect(html).toContain("방향 필터");
	});

	test("renders English filter labels", () => {
		const html = renderToString(<JournalFilters locale="en" />);
		expect(html).toContain("Date Range");
		expect(html).toContain("Symbol Filter");
		expect(html).toContain("Side Filter");
	});

	test("renders search placeholder in Korean", () => {
		const html = renderToString(<JournalFilters />);
		expect(html).toContain("심볼, 전략 이름으로 검색");
	});

	test("renders search placeholder in English", () => {
		const html = renderToString(<JournalFilters locale="en" />);
		expect(html).toContain("Search by symbol, strategy name");
	});
});

describe("JournalEntryDetail", () => {
	test("renders Korean field labels", () => {
		const html = renderToString(<JournalEntryDetail entry={sampleEntry} />);
		expect(html).toContain("거래 요약");
		expect(html).toContain("거래 날짜");
		expect(html).toContain("진입 근거");
		expect(html).toContain("청산 근거");
		expect(html).toContain("메모");
		expect(html).toContain("태그");
	});

	test("renders English field labels", () => {
		const html = renderToString(<JournalEntryDetail entry={sampleEntry} locale="en" />);
		expect(html).toContain("Trade Summary");
		expect(html).toContain("Trade Date");
		expect(html).toContain("Entry Reason");
		expect(html).toContain("Exit Reason");
		expect(html).toContain("Notes");
		expect(html).toContain("Tags");
	});

	test("renders analysis labels in Korean", () => {
		const html = renderToString(<JournalEntryDetail entry={sampleEntry} />);
		expect(html).toContain("분석");
		expect(html).toContain("최대 유리 가격 이동 (MFE)");
		expect(html).toContain("최대 불리 가격 이동 (MAE)");
		expect(html).toContain("리스크/리워드 비율");
		expect(html).toContain("엣지 비율");
	});

	test("renders analysis labels in English", () => {
		const html = renderToString(<JournalEntryDetail entry={sampleEntry} locale="en" />);
		expect(html).toContain("Analysis");
		expect(html).toContain("Maximum Favorable Excursion (MFE)");
		expect(html).toContain("Maximum Adverse Excursion (MAE)");
		expect(html).toContain("Risk/Reward Ratio");
		expect(html).toContain("Edge Ratio");
	});

	test("renders entry data values", () => {
		const html = renderToString(<JournalEntryDetail entry={sampleEntry} />);
		expect(html).toContain("BTCUSDT");
		expect(html).toContain("65000.00");
		// React SSR may inject HTML comment nodes between concatenated text
		expect(html).toContain("1500.00");
		expect(html).toContain("BB squeeze breakout");
		expect(html).toContain("Strong volume confirmation");
	});

	test("renders tag values (user content, not translated)", () => {
		const html = renderToString(<JournalEntryDetail entry={sampleEntry} />);
		expect(html).toContain("trend-follow");
		expect(html).toContain("breakout");
	});

	test("does not render analysis section when no analysis data", () => {
		const entryNoAnalysis: JournalEntry = { ...sampleEntry, mfe: undefined, mae: undefined, riskReward: undefined, edgeRatio: undefined };
		const html = renderToString(<JournalEntryDetail entry={entryNoAnalysis} />);
		expect(html).not.toContain("Maximum Favorable Excursion");
	});
});

describe("JournalStats", () => {
	test("renders Korean stats title", () => {
		const html = renderToString(<JournalStats stats={sampleStats} />);
		expect(html).toContain("통계");
	});

	test("renders English stats title", () => {
		const html = renderToString(<JournalStats stats={sampleStats} locale="en" />);
		expect(html).toContain("Statistics");
	});

	test("renders Korean stat labels", () => {
		const html = renderToString(<JournalStats stats={sampleStats} />);
		expect(html).toContain("총 거래 수");
		expect(html).toContain("승률");
		expect(html).toContain("평균 손익");
		expect(html).toContain("총 손익");
	});

	test("renders English stat labels", () => {
		const html = renderToString(<JournalStats stats={sampleStats} locale="en" />);
		expect(html).toContain("Total Trades");
		expect(html).toContain("Win Rate");
		expect(html).toContain("Average PnL");
		expect(html).toContain("Total PnL");
	});

	test("renders stat values", () => {
		const html = renderToString(<JournalStats stats={sampleStats} />);
		expect(html).toContain("42");
		// React SSR may inject HTML comment nodes between concatenated text
		expect(html).toContain("66.7");
		expect(html).toContain("350.50");
		expect(html).toContain("14721.00");
	});
});

describe("JournalComparison", () => {
	const comparisonProps = {
		backtestPnl: 5000,
		livePnl: 4200,
		backtestWinRate: 0.65,
		liveWinRate: 0.58,
	};

	test("renders Korean comparison heading", () => {
		const html = renderToString(<JournalComparison {...comparisonProps} />);
		expect(html).toContain("백테스트 vs 실거래");
	});

	test("renders English comparison heading", () => {
		const html = renderToString(<JournalComparison {...comparisonProps} locale="en" />);
		expect(html).toContain("Backtest vs Live");
	});

	test("renders Korean section titles", () => {
		const html = renderToString(<JournalComparison {...comparisonProps} />);
		expect(html).toContain("백테스트");
		expect(html).toContain("실거래");
	});

	test("renders English section titles", () => {
		const html = renderToString(<JournalComparison {...comparisonProps} locale="en" />);
		expect(html).toContain("Backtest");
		expect(html).toContain("Live");
	});

	test("renders Korean PnL and win rate labels", () => {
		const html = renderToString(<JournalComparison {...comparisonProps} />);
		expect(html).toContain("백테스트 손익");
		expect(html).toContain("실거래 손익");
		expect(html).toContain("백테스트 승률");
		expect(html).toContain("실거래 승률");
	});

	test("renders comparison values", () => {
		const html = renderToString(<JournalComparison {...comparisonProps} />);
		// React SSR may inject HTML comment nodes between concatenated text
		expect(html).toContain("5000.00");
		expect(html).toContain("4200.00");
		expect(html).toContain("65.0");
		expect(html).toContain("58.0");
	});
});
