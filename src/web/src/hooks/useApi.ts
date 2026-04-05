import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../lib/api.ts";

/* ------------------------------------------------------------------ */
/*  Response types                                                     */
/* ------------------------------------------------------------------ */

export interface HealthResponse {
  status: "ok" | "degraded" | "down";
  uptime: string;
  exchange: {
    name: string;
    connected: boolean;
  };
  dailyLoss: {
    current: number;
    limit: number;
  };
  sessionLosses: {
    current: number;
    limit: number;
  };
}

export interface SymbolState {
  symbol: string;
  exchange: string;
  price: string;
  fsmState: "WATCHING" | "IDLE" | "POSITION";
  direction: "LONG_ONLY" | "SHORT_ONLY" | "NEUTRAL";
  tradeBlock: {
    active: boolean;
    reason?: string;
    until?: string;
  };
}

export interface Position {
  id: string;
  symbol: string;
  exchange: string;
  side: "LONG" | "SHORT";
  entryPrice: string;
  currentPrice: string;
  size: string;
  unrealizedPnl: string;
  liquidationStage: string;
  slStatus: "registered" | "unregistered";
}

export interface StatsResponse {
  todayPnl: string;
  todayTrades: number;
  winRate: number;
}

export interface Signal {
  id: string;
  time: string;
  symbol: string;
  type: string;
  result: string;
}

export interface Event {
  id: string;
  time: string;
  symbol: string;
  side: "LONG" | "SHORT";
  pnl: string;
}

export interface ConfigResponse {
  mode: "analysis" | "alert" | "live";
  tradeBlock: boolean;
}

/* ------------------------------------------------------------------ */
/*  Query hooks                                                        */
/* ------------------------------------------------------------------ */

export function useHealth() {
  return useQuery<HealthResponse>({
    queryKey: ["health"],
    queryFn: () => apiGet<HealthResponse>("/health"),
    refetchInterval: 30_000,
  });
}

export function useSymbolStates() {
  return useQuery<SymbolState[]>({
    queryKey: ["symbol-states"],
    queryFn: () => apiGet<SymbolState[]>("/symbol-states"),
    refetchInterval: 5_000,
  });
}

export function usePositions() {
  return useQuery<Position[]>({
    queryKey: ["positions"],
    queryFn: () => apiGet<Position[]>("/positions"),
    refetchInterval: 5_000,
  });
}

export function useStats() {
  return useQuery<StatsResponse>({
    queryKey: ["stats"],
    queryFn: () => apiGet<StatsResponse>("/stats"),
    refetchInterval: 5_000,
  });
}

export function useSignalsRecent() {
  return useQuery<Signal[]>({
    queryKey: ["signals-recent"],
    queryFn: () => apiGet<Signal[]>("/signals/recent"),
  });
}

export function useEventsRecent() {
  return useQuery<Event[]>({
    queryKey: ["events-recent"],
    queryFn: () => apiGet<Event[]>("/events/recent"),
  });
}

export function useConfig() {
  return useQuery<ConfigResponse>({
    queryKey: ["config"],
    queryFn: () => apiGet<ConfigResponse>("/config"),
    refetchInterval: 10_000,
  });
}

/* ------------------------------------------------------------------ */
/*  Trade History types & hooks                                        */
/* ------------------------------------------------------------------ */

export interface Ticket {
  id: string;
  time: string;
  symbol: string;
  exchange: string;
  side: "LONG" | "SHORT";
  entryPrice: string;
  exitPrice: string;
  size: string;
  realizedPnl: string;
  result: "WIN" | "LOSS" | "TIMEOUT";
}

export interface TicketsResponse {
  items: Ticket[];
  total: number;
  cursor: string | null;
}

export interface TicketsParams {
  period?: string;
  symbol?: string;
  exchange?: string;
  result?: string;
  cursor?: string;
  limit?: number;
}

export interface TradeStatsResponse {
  totalPnl: string;
  totalTrades: number;
  winRate: number;
  avgRiskReward: string;
  maxDrawdown: string;
  /** 수수료 차감 후 기대값 (소수 형태, 예: "0.0082") */
  expectancy: string;
  /** 최대 연속 손실 횟수 */
  maxConsecutiveLosses: number;
}

function buildTicketsPath(params: TicketsParams): string {
  const searchParams = new URLSearchParams();
  if (params.period) searchParams.set("period", params.period);
  if (params.symbol) searchParams.set("symbol", params.symbol);
  if (params.exchange) searchParams.set("exchange", params.exchange);
  if (params.result) searchParams.set("result", params.result);
  if (params.cursor) searchParams.set("cursor", params.cursor);
  if (params.limit !== undefined) searchParams.set("limit", String(params.limit));
  const qs = searchParams.toString();
  return qs ? `/tickets?${qs}` : "/tickets";
}

export function useTickets(params: TicketsParams) {
  return useQuery<TicketsResponse>({
    queryKey: ["tickets", params],
    queryFn: () => apiGet<TicketsResponse>(buildTicketsPath(params)),
  });
}

export function useTradeStats(period?: string) {
  const path = period ? `/stats/trades?period=${period}` : "/stats/trades";
  return useQuery<TradeStatsResponse>({
    queryKey: ["trade-stats", period],
    queryFn: () => apiGet<TradeStatsResponse>(path),
  });
}
