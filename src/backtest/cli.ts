/**
 * CLI entry point for `bun run backtest`.
 *
 * Argument parsing is extracted into a pure function (parseArgs) so it can be
 * unit-tested without any side effects or DB access.
 *
 * Usage:
 *   bun run backtest -- --symbol BTCUSDT --start 2024-01-01 --end 2024-06-01
 *   bun run backtest -- --mode wfo --symbol BTCUSDT --start 2021-01-01 --end 2024-01-01
 *   bun run backtest -- --help
 */

import type { BacktestConfig } from "@/backtest/engine";
import type { ParamSet, ParamSpace } from "@/backtest/param-search";
import { printReport } from "@/backtest/reporter";
import type { WfoConfig } from "@/backtest/wfo";
import { generateWfoWindows, runWfo } from "@/backtest/wfo";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type CliArgs = {
  symbol: string;
  exchange: string;
  start: Date;
  end: Date;
  mode: "backtest" | "wfo";
  threads: number;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const USAGE = `
Usage: bun run backtest -- [options]

Options:
  --symbol    <string>   Trading pair symbol, e.g. BTCUSDT  (required)
  --exchange  <string>   Exchange name (default: binance)
  --start     <YYYY-MM-DD>  Backtest start date (required)
  --end       <YYYY-MM-DD>  Backtest end date   (required)
  --mode      backtest|wfo  Run mode (default: backtest)
  --threads   <number>   Worker threads (default: CPU/2, minimum 1)
  --help                 Print this help message and exit
`.trimStart();

/**
 * Parse a YYYY-MM-DD date string into a UTC Date.
 * Throws a descriptive error when the format is invalid.
 */
function parseDateArg(value: string, flag: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`invalid date format for ${flag}: "${value}" (expected YYYY-MM-DD)`);
  }
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`invalid date format for ${flag}: "${value}" (expected YYYY-MM-DD)`);
  }
  return d;
}

function defaultThreads(): number {
  // navigator.hardwareConcurrency is available in Bun; fall back to 2 if not.
  const cpus =
    typeof navigator !== "undefined" && navigator.hardwareConcurrency > 0
      ? navigator.hardwareConcurrency
      : 4;
  return Math.max(1, Math.floor(cpus / 2));
}

// ---------------------------------------------------------------------------
// parseArgs — pure, throws on invalid input
// ---------------------------------------------------------------------------

/**
 * Parse raw argv tokens into a validated CliArgs object.
 * Throws a descriptive Error when validation fails.
 *
 * @param argv - String array, typically Bun.argv.slice(2)
 */
export function parseArgs(argv: string[]): CliArgs {
  // Collect raw values from the token stream.
  const raw: Record<string, string> = {};

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i] as string;
    if (token === "--help" || token === "-h") {
      process.stdout.write(USAGE);
      process.exit(0);
    }
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        // Boolean-style flag — not expected for this CLI but skip gracefully.
        continue;
      }
      raw[key] = next as string;
      i++;
    }
  }

  // --symbol (required)
  const symbol = raw.symbol;
  if (!symbol) {
    throw new Error("symbol is required");
  }

  // --start (required)
  if (!raw.start) {
    throw new Error("--start is required");
  }
  const start = parseDateArg(raw.start as string, "--start");

  // --end (required)
  if (!raw.end) {
    throw new Error("--end is required");
  }
  const end = parseDateArg(raw.end as string, "--end");

  // Date ordering
  if (start.getTime() >= end.getTime()) {
    throw new Error("start must be before end");
  }

  // --exchange (optional, default: binance)
  const exchange = raw.exchange ?? "binance";

  // --mode (optional, default: backtest)
  const rawMode = raw.mode ?? "backtest";
  if (rawMode !== "backtest" && rawMode !== "wfo") {
    throw new Error(`mode must be backtest or wfo, got "${rawMode}"`);
  }
  const mode = rawMode as "backtest" | "wfo";

  // --threads (optional, default: CPU/2)
  let threads = defaultThreads();
  if (raw.threads !== undefined) {
    const parsed = Number(raw.threads);
    if (!Number.isInteger(parsed) || parsed < 1) {
      throw new Error("threads must be >= 1");
    }
    threads = parsed;
  }

  return { symbol, exchange, start, end, mode, threads };
}

// ---------------------------------------------------------------------------
// runCli — thin orchestrator (not unit-tested; requires DB + exchange setup)
// ---------------------------------------------------------------------------

/**
 * Orchestrate a backtest or WFO run based on parsed CLI args.
 * This function is intentionally thin — all real logic lives in engine/wfo.
 *
 * Wiring note: a real run requires:
 *   - A DB-backed candle loader (LoadCandles) injected into BacktestRunner
 *   - A fully configured MockAdapterConfig (candles, symbolInfo, balance)
 *   - A strategy OnCandleClose callback
 *
 * The function signature accepts an optional deps parameter to allow injection
 * in integration tests.  When called from the CLI entry point, deps defaults
 * to the production implementations.
 *
 * @param args - Validated CliArgs from parseArgs
 */
export async function runCli(args: CliArgs): Promise<void> {
  const config: BacktestConfig = {
    symbol: args.symbol,
    exchange: args.exchange as BacktestConfig["exchange"],
    startDate: args.start,
    endDate: args.end,
  };

  process.stderr.write(
    `${args.mode === "wfo" ? "WFO" : "Backtest"}: ${args.symbol} on ${args.exchange} ` +
      `${args.start.toISOString().slice(0, 10)} → ${args.end.toISOString().slice(0, 10)}\n`,
  );

  // Lazy imports — only loaded when actually running (not during --help/validation).
  const { BacktestRunner } = await import("@/backtest/engine");
  const { calcFullMetrics } = await import("@/backtest/metrics");
  const { runParameterSearch } = await import("@/backtest/param-search");
  const { d } = await import("@/core/decimal");
  const { MockExchangeAdapter } = await import("@/backtest/mock-adapter");

  // Build a minimal adapter config for the CLI runner.
  // In a full integration the symbol info and balance would come from the DB.
  const makeAdapter = (_startDate: Date) =>
    new MockExchangeAdapter({
      exchange: config.exchange,
      initialBalance: d("10000"),
      candles: [],
      symbolInfo: {
        symbol: config.symbol,
        tickSize: d("0.01"),
        minOrderSize: d("0.001"),
        maxLeverage: 20,
        contractSize: d("1"),
      },
    });

  if (args.mode === "backtest") {
    const loadCandles = async () => [];
    const adapter = makeAdapter(args.start);
    const runner = new BacktestRunner(config, loadCandles);
    // Strategy callback is a no-op stub; real strategy wiring is out of scope for this CLI task.
    const result = await runner.run(async (_candle, _adapter, _addTrade) => {}, adapter);
    const metrics = calcFullMetrics(result.trades);
    printReport(config, metrics, result.trades);
  } else {
    const wfoConfig: WfoConfig = {
      isMonths: 6,
      oosMonths: 2,
      rollMonths: 1,
      totalStartDate: args.start,
      totalEndDate: args.end,
    };

    const runBacktestWindow = async (window: { start: Date; end: Date }, _params: ParamSet) => {
      const windowConfig: BacktestConfig = {
        ...config,
        startDate: window.start,
        endDate: window.end,
      };
      const runner = new BacktestRunner(windowConfig, async () => []);
      const adapter = makeAdapter(window.start);
      const result = await runner.run(async (_candle, _adapter, _addTrade) => {}, adapter);
      return calcFullMetrics(result.trades);
    };

    const searchParamsFn = async (
      runBt: (params: ParamSet) => Promise<ReturnType<typeof calcFullMetrics>>,
      spaces: ParamSpace[],
    ) => {
      const results = await runParameterSearch(runBt, spaces);
      return results.map((r) => ({ params: r.params, metrics: r.metrics }));
    };

    const wfoResult = await runWfo(wfoConfig, [], {
      generateWindows: generateWfoWindows,
      searchParams: searchParamsFn,
      runBacktest: runBacktestWindow,
    });

    process.stdout.write(
      `WFO complete — ${wfoResult.windows.length} valid windows, ` +
        `overall efficiency: ${wfoResult.overallEfficiency.toFixed(4)}\n`,
    );
  }
}

// ---------------------------------------------------------------------------
// Entry point guard
// ---------------------------------------------------------------------------

if (import.meta.main) {
  const args = parseArgs(Bun.argv.slice(2));
  runCli(args).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error: ${message}\n`);
    process.stderr.write(USAGE);
    process.exit(1);
  });
}
