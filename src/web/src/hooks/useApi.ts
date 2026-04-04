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
