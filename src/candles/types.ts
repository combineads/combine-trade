import type { Candle, Timeframe } from "@/core/types";

export type CandleCloseCallback = (candle: Candle, timeframe: Timeframe) => void;
