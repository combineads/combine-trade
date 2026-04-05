import type { BacktestConfig, BacktestTrade } from "@/backtest/engine";
import type { FullMetrics } from "@/backtest/metrics";

// ---------------------------------------------------------------------------
// DB injection interface
// ---------------------------------------------------------------------------

/**
 * Minimal DB interface accepted by saveReport.
 * In production, pass a Drizzle db instance wrapped with this signature.
 * In tests, pass a mock that records insertions without hitting a real DB.
 */
export type ReporterDb = {
  insert: (values: BacktestReportRow) => Promise<void>;
};

export type BacktestReportRow = {
  run_type: "BACKTEST";
  symbol: string;
  exchange: string;
  start_date: Date;
  end_date: Date;
  config_snapshot: Record<string, unknown>;
  results: Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// Serialization helpers
// ---------------------------------------------------------------------------

/**
 * Serializes FullMetrics to a plain JSON-safe object.
 * All Decimal fields are converted to numbers; avgHoldDuration stays a number.
 */
function serializeMetrics(metrics: FullMetrics): Record<string, unknown> {
  return {
    totalTrades: metrics.totalTrades.toNumber(),
    wins: metrics.wins.toNumber(),
    losses: metrics.losses.toNumber(),
    winRate: metrics.winRate.toNumber(),
    expectancy: metrics.expectancy.toNumber(),
    maxDrawdown: metrics.maxDrawdown.toNumber(),
    maxDrawdownPct: metrics.maxDrawdownPct.toNumber(),
    sharpeRatio: metrics.sharpeRatio.toNumber(),
    profitFactor: metrics.profitFactor.toNumber(),
    avgHoldDuration: metrics.avgHoldDuration,
    maxConsecutiveWins: metrics.maxConsecutiveWins.toNumber(),
    maxConsecutiveLosses: metrics.maxConsecutiveLosses.toNumber(),
  };
}

/**
 * Serializes BacktestConfig to a plain JSON-safe object.
 */
function serializeConfig(config: BacktestConfig): Record<string, unknown> {
  return {
    symbol: config.symbol,
    exchange: config.exchange,
    startDate: config.startDate.toISOString(),
    endDate: config.endDate.toISOString(),
    ...(config.slippagePct !== undefined ? { slippagePct: config.slippagePct } : {}),
  };
}

// ---------------------------------------------------------------------------
// printReport
// ---------------------------------------------------------------------------

/**
 * Prints a formatted metrics summary table to the console.
 *
 * @param config   - BacktestConfig that was used for the run
 * @param metrics  - FullMetrics computed from the run
 * @param trades   - Individual trades (reserved for future per-trade detail output)
 */
export function printReport(
  config: BacktestConfig,
  metrics: FullMetrics,
  _trades: BacktestTrade[],
): void {
  const divider = "─".repeat(48);
  const winRatePct = metrics.winRate.times("100").toFixed(2);
  const mddPct = metrics.maxDrawdownPct.times("100").toFixed(2);

  console.log(divider);
  console.log(` 백테스트 결과  ${config.symbol} (${config.exchange})`);
  console.log(
    ` 기간: ${config.startDate.toISOString().slice(0, 10)} ~ ${config.endDate.toISOString().slice(0, 10)}`,
  );
  console.log(divider);
  console.log(` ${"항목".padEnd(20)} ${"값".padStart(16)}`);
  console.log(divider);
  console.log(` ${"총 거래".padEnd(20)} ${String(metrics.totalTrades.toNumber()).padStart(16)}`);
  console.log(` ${"승률".padEnd(20)} ${`${winRatePct}%`.padStart(16)}`);
  console.log(` ${"기대값".padEnd(20)} ${metrics.expectancy.toFixed(4).padStart(16)}`);
  console.log(` ${"MDD".padEnd(20)} ${`${mddPct}%`.padStart(16)}`);
  console.log(` ${"샤프 비율".padEnd(20)} ${metrics.sharpeRatio.toFixed(4).padStart(16)}`);
  console.log(` ${"프로핏팩터".padEnd(20)} ${metrics.profitFactor.toFixed(4).padStart(16)}`);
  console.log(
    ` ${"평균 보유시간(s)".padEnd(20)} ${String(metrics.avgHoldDuration.toFixed(0)).padStart(16)}`,
  );
  console.log(divider);
}

// ---------------------------------------------------------------------------
// saveReport
// ---------------------------------------------------------------------------

/**
 * Inserts a backtest result row into the backtests table via the injected db.
 *
 * @param db      - Injected DB interface (Drizzle in production, mock in tests)
 * @param config  - BacktestConfig used for this run
 * @param metrics - FullMetrics from this run
 */
export async function saveReport(
  db: ReporterDb,
  config: BacktestConfig,
  metrics: FullMetrics,
): Promise<void> {
  const row: BacktestReportRow = {
    run_type: "BACKTEST",
    symbol: config.symbol,
    exchange: config.exchange,
    start_date: config.startDate,
    end_date: config.endDate,
    config_snapshot: serializeConfig(config),
    results: serializeMetrics(metrics),
  };

  await db.insert(row);
}
