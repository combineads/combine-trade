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

import type { BacktestConfig, LoadCandles } from "@/backtest/engine";
import type { ParamSet, ParamSpace } from "@/backtest/param-search";
import { printReport } from "@/backtest/reporter";
import type { WfoConfig, WfoDeps } from "@/backtest/wfo";
import { generateWfoWindows, runWfo } from "@/backtest/wfo";
import { TIMEFRAMES } from "@/core/constants";
import { d } from "@/core/decimal";
import { createLogger } from "@/core/logger";
import type { Candle, Exchange, Timeframe } from "@/core/types";
import type { DbInstance } from "@/db/pool";
import type { CandleRow, NewBacktestRow } from "@/db/schema";

const log = createLogger("cli");

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
// CandleRow → Candle conversion
// ---------------------------------------------------------------------------

function candleRowToCandle(row: CandleRow): Candle {
  return {
    id: row.id,
    symbol: row.symbol,
    exchange: row.exchange as Exchange,
    timeframe: row.timeframe as Timeframe,
    open_time: row.open_time,
    open: d(row.open),
    high: d(row.high),
    low: d(row.low),
    close: d(row.close),
    volume: d(row.volume),
    is_closed: row.is_closed ?? false,
    created_at: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// loadCandlesFromDb — DB-backed candle loader with auto-sync
// ---------------------------------------------------------------------------

async function loadCandlesFromDb(
  db: DbInstance,
  symbol: string,
  exchange: Exchange,
  startDate: Date,
  endDate: Date,
): Promise<Candle[]> {
  const { getCandles } = await import("@/candles/repository");
  const { syncCandles } = await import("@/candles/sync");
  const { symbolTable } = await import("@/db/schema");

  // Load candles for all timeframes and merge
  const loadAll = async (): Promise<CandleRow[]> => {
    const rows: CandleRow[] = [];
    for (const tf of TIMEFRAMES) {
      const tfRows = await getCandles(db, symbol, exchange, tf, startDate, endDate);
      rows.push(...tfRows);
    }
    return rows;
  };

  let rows = await loadAll();

  // If no candles found, sync from Binance then retry
  if (rows.length === 0) {
    log.info("no candles in DB — syncing from exchange", { symbol, exchange });

    // Ensure symbol exists (FK constraint)
    await db
      .insert(symbolTable)
      .values({
        symbol,
        exchange,
        name: symbol,
        base_asset: symbol.replace(/USDT$/, ""),
        quote_asset: "USDT",
      })
      .onConflictDoNothing();

    await syncCandles({
      symbols: [{ symbol, exchange }],
      timeframes: [...TIMEFRAMES],
      db,
    });

    rows = await loadAll();
    log.info("sync complete", { symbol, candlesLoaded: rows.length });
  }

  return rows.map(candleRowToCandle);
}

// ---------------------------------------------------------------------------
// createLoadCandles — build a LoadCandles callback from a DB instance
// ---------------------------------------------------------------------------

function createLoadCandles(db: DbInstance): LoadCandles {
  return (symbol, exchange, startDate, endDate) =>
    loadCandlesFromDb(db, symbol, exchange, startDate, endDate);
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
// saveBacktestResult — fire-and-forget DB persistence
// ---------------------------------------------------------------------------

/**
 * Inserts a single row into the `backtests` table.
 * Returns the newly assigned row UUID so WFO parent/child rows can be linked.
 *
 * Exported so tests can call it directly; the CLI uses it via runCli.
 */
export async function saveBacktestResult(db: DbInstance, row: NewBacktestRow): Promise<string> {
  const { backtestTable, symbolTable } = await import("@/db/schema");

  // Ensure the referenced symbol exists (backtest may target unregistered symbols).
  await db
    .insert(symbolTable)
    .values({
      symbol: row.symbol,
      exchange: row.exchange,
      name: row.symbol,
      base_asset: row.symbol.replace(/USDT$/, ""),
      quote_asset: "USDT",
    })
    .onConflictDoNothing();

  const result = await db.insert(backtestTable).values(row).returning({ id: backtestTable.id });
  const inserted = result[0];
  if (inserted === undefined) {
    throw new Error("saveBacktestResult: INSERT returned no rows");
  }
  return inserted.id;
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
  const { MockExchangeAdapter } = await import("@/backtest/mock-adapter");

  // Build an adapter with the given candles. Symbol info and balance are minimal defaults;
  // a full integration would read these from the DB.
  const makeAdapter = (candles: Candle[]) =>
    new MockExchangeAdapter({
      exchange: config.exchange,
      initialBalance: d("10000"),
      candles,
      symbolInfo: {
        symbol: config.symbol,
        tickSize: d("0.01"),
        minOrderSize: d("0.001"),
        maxLeverage: 20,
        contractSize: d("1"),
      },
    });

  // Acquire DB instance once; used for candle loading and saveResult in both modes.
  // initDb is lazy: if the DB is already initialised this is a no-op.
  let db: DbInstance | null = null;
  try {
    const { initDb, getDb } = await import("@/db/pool");
    await initDb();
    db = getDb();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn("could not initialise DB — results will not be persisted", { message });
  }

  if (args.mode === "backtest") {
    if (db === null) {
      throw new Error("DB is required for backtest mode — candles must be loaded from database");
    }
    const loadCandles = createLoadCandles(db);
    // Pre-load candles so we can pass them to the adapter as well.
    const candles = await loadCandles(
      config.symbol,
      config.exchange,
      config.startDate,
      config.endDate,
    );
    const adapter = makeAdapter(candles);
    const { createBacktestStrategy } = await import("@/backtest/strategy");
    const strategyCallback = createBacktestStrategy(config.symbol);
    const runner = new BacktestRunner(config, async () => candles);
    const result = await runner.run(strategyCallback, adapter);
    const metrics = calcFullMetrics(result.trades);
    printReport(config, metrics, result.trades);

    // Persist result — fire-and-forget: DB errors must not abort the CLI.
    if (db !== null) {
      saveBacktestResult(db, {
        run_type: "BACKTEST",
        symbol: config.symbol,
        exchange: config.exchange,
        start_date: config.startDate,
        end_date: config.endDate,
        config_snapshot: config as unknown as Record<string, unknown>,
        results: metrics as unknown as Record<string, unknown>,
      }).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        log.warn("saveBacktestResult failed — result not persisted", { message });
      });
    }
  } else {
    const wfoConfig: WfoConfig = {
      isMonths: 6,
      oosMonths: 2,
      rollMonths: 1,
      totalStartDate: args.start,
      totalEndDate: args.end,
    };

    if (db === null) {
      throw new Error("DB is required for WFO mode — candles must be loaded from database");
    }
    const wfoLoadCandles = createLoadCandles(db);

    const runBacktestWindow = async (window: { start: Date; end: Date }, _params: ParamSet) => {
      const windowConfig: BacktestConfig = {
        ...config,
        startDate: window.start,
        endDate: window.end,
      };
      const candles = await wfoLoadCandles(
        config.symbol,
        config.exchange,
        window.start,
        window.end,
      );
      const adapter = makeAdapter(candles);
      const { createBacktestStrategy } = await import("@/backtest/strategy");
      const strategyCallback = createBacktestStrategy(config.symbol);
      const runner = new BacktestRunner(windowConfig, async () => candles);
      const result = await runner.run(strategyCallback, adapter);
      return calcFullMetrics(result.trades);
    };

    const searchParamsFn = async (
      runBt: (params: ParamSet) => Promise<ReturnType<typeof calcFullMetrics>>,
      spaces: ParamSpace[],
    ) => {
      const results = await runParameterSearch(runBt, spaces);
      return results.map((r) => ({ params: r.params, metrics: r.metrics }));
    };

    // Build the WFO deps object. Only add saveResult when the DB is available,
    // because exactOptionalPropertyTypes prohibits assigning undefined to an
    // optional property — the key must be absent when there is no DB.
    const capturedDb = db;
    const wfoDeps: WfoDeps = {
      generateWindows: generateWfoWindows,
      searchParams: searchParamsFn,
      runBacktest: runBacktestWindow,
    };

    if (capturedDb !== null) {
      // saveResult maps WfoDeps callback shape → NewBacktestRow for the backtests table.
      wfoDeps.saveResult = async ({
        runType,
        parentId,
        windowIndex,
        config: cfg,
        results: res,
      }) => {
        const cfgMap = cfg as Record<string, unknown>;
        return saveBacktestResult(capturedDb, {
          run_type: "WFO",
          symbol: args.symbol,
          exchange: args.exchange,
          // For parent rows use the overall WFO date range; for child windows the
          // isStart/oosEnd dates are available in cfg (set by wfo.ts).
          start_date:
            cfgMap.isStart !== undefined ? new Date(cfgMap.isStart as string) : args.start,
          end_date: cfgMap.oosEnd !== undefined ? new Date(cfgMap.oosEnd as string) : args.end,
          config_snapshot: cfgMap,
          results: res as Record<string, unknown>,
          parent_id: parentId ?? null,
          window_index: windowIndex ?? null,
        }).catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          log.warn("WFO saveResult failed — window not persisted", { runType, message });
          // Return empty string: keeps WFO running; caller ignores the returned ID
          // on catch paths.
          return "";
        });
      };
    }

    const wfoResult = await runWfo(wfoConfig, [], wfoDeps);

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
