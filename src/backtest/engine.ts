import type { Candle, Direction, Exchange, TradeResult } from "@/core/types";
import type { Decimal } from "@/core/decimal";
import type { MockExchangeAdapter } from "./mock-adapter";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type BacktestConfig = {
  symbol: string;
  exchange: Exchange;
  startDate: Date;
  endDate: Date;
  slippagePct?: number;
};

export type BacktestTrade = {
  direction: Direction;
  entryPrice: Decimal;
  exitPrice: Decimal;
  size: Decimal;
  pnl: Decimal;
  pnlPct: Decimal;
  holdDurationSec: number;
  result: TradeResult;
  openedAt: Date;
  closedAt: Date;
};

export type BacktestResult = {
  config: BacktestConfig;
  trades: BacktestTrade[];
  startDate: Date;
  endDate: Date;
  totalCandles: number;
};

// ---------------------------------------------------------------------------
// Timeframe sort priority: lower number = processed first
// ---------------------------------------------------------------------------

const TIMEFRAME_PRIORITY: Record<string, number> = {
  "1D": 0,
  "1H": 1,
  "5M": 2,
  "1M": 3,
};

function timeframePriority(tf: string): number {
  return TIMEFRAME_PRIORITY[tf] ?? 99;
}

// ---------------------------------------------------------------------------
// Candle loader type — injected to allow test mocking without a real DB
// ---------------------------------------------------------------------------

export type LoadCandles = (
  symbol: string,
  exchange: Exchange,
  startDate: Date,
  endDate: Date,
) => Promise<Candle[]>;

// ---------------------------------------------------------------------------
// Callback signature
// ---------------------------------------------------------------------------

/**
 * Called once per candle. The `addTrade` helper records completed trades for
 * inclusion in BacktestResult.  BacktestRunner does not implement strategy
 * logic — that is left to the callback (T-13-005).
 */
export type OnCandleClose = (
  candle: Candle,
  adapter: MockExchangeAdapter,
  addTrade: (trade: BacktestTrade) => void,
) => Promise<void>;

// ---------------------------------------------------------------------------
// BacktestRunner
// ---------------------------------------------------------------------------

export class BacktestRunner {
  private readonly config: BacktestConfig;
  private readonly loadCandles: LoadCandles;

  constructor(config: BacktestConfig, loadCandles: LoadCandles) {
    if (config.startDate >= config.endDate) {
      throw new Error(
        `BacktestRunner: startDate must be before endDate. Got startDate=${config.startDate.toISOString()}, endDate=${config.endDate.toISOString()}`,
      );
    }
    this.config = config;
    this.loadCandles = loadCandles;
  }

  /**
   * Run the backtest loop:
   * 1. Load candles via the injected loader.
   * 2. Sort them chronologically; same-timestamp candles are ordered by TF
   *    priority (1D → 1H → 5M → 1M).
   * 3. For each candle: advance the mock adapter's clock, then invoke the
   *    onCandleClose callback.
   * 4. Return aggregated BacktestResult.
   */
  async run(onCandleClose: OnCandleClose, adapter: MockExchangeAdapter): Promise<BacktestResult> {
    const { symbol, exchange, startDate, endDate } = this.config;

    const candles = await this.loadCandles(symbol, exchange, startDate, endDate);

    // Sort: open_time ASC, then TF priority for ties
    const sorted = [...candles].sort((a, b) => {
      const timeDiff = a.open_time.getTime() - b.open_time.getTime();
      if (timeDiff !== 0) return timeDiff;
      return timeframePriority(a.timeframe) - timeframePriority(b.timeframe);
    });

    const trades: BacktestTrade[] = [];

    const addTrade = (trade: BacktestTrade): void => {
      trades.push(trade);
    };

    for (const candle of sorted) {
      adapter.advanceTime(candle.open_time.getTime());
      await onCandleClose(candle, adapter, addTrade);
    }

    return {
      config: this.config,
      trades,
      startDate,
      endDate,
      totalCandles: sorted.length,
    };
  }
}
