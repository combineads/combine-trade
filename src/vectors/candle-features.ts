/**
 * 38봉 × 5 캔들 피처 추출기 (PRD §7.8)
 *
 * 출력: number[190]
 * 인덱스 레이아웃: bar[i] = [body, upperWick, lowerWick, range, ret] at indices i*5 to i*5+4
 *
 * 입력 캔들: newest-last (index 0 = 가장 오래된, index 37 = 가장 최근)
 * 캔들 < 38개 → 부족분 0.0 패딩
 *
 * 가중치: upperWick × FEATURE_WEIGHTS.upperWick, lowerWick × FEATURE_WEIGHTS.lowerWick
 * 모든 가격 계산은 Decimal.js 사용
 */

import Decimal from "decimal.js";
import type { Candle } from "@/core/types";
import { FEATURE_WEIGHTS } from "@/vectors/feature-spec";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const CANDLE_BARS = 38 as const;
export const CANDLE_FEATURES_PER_BAR = 5 as const;
export const CANDLE_FEATURE_DIM = CANDLE_BARS * CANDLE_FEATURES_PER_BAR; // 190

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** NaN / Infinity → 0.0 */
function safe(v: number): number {
  return Number.isFinite(v) ? v : 0.0;
}

// ---------------------------------------------------------------------------
// Feature extraction per bar
// ---------------------------------------------------------------------------

/**
 * 단일 캔들에서 5개 피처 추출.
 *
 * @param candle - 현재 캔들
 * @param prevClose - 이전 캔들의 close (없으면 null → ret = 0)
 * @param upperWickWeight - upperWick 가중치
 * @param lowerWickWeight - lowerWick 가중치
 * @returns [body, upperWick, lowerWick, range, ret] (가중치 적용 완료)
 */
function extractBarFeatures(
  candle: Candle,
  prevClose: Decimal | null,
  upperWickWeight: number,
  lowerWickWeight: number,
): [number, number, number, number, number] {
  const open = candle.open;
  const high = candle.high;
  const low = candle.low;
  const close = candle.close;

  // close가 0인 경우 안전하게 처리
  if (close.isZero()) {
    return [0, 0, 0, 0, 0];
  }

  // body = |close - open| / close
  const body = safe(open.minus(close).abs().dividedBy(close).toNumber());

  // upperWick = (high - max(open, close)) / close × weight
  const maxOpenClose = Decimal.max(open, close);
  const upperWickRaw = safe(high.minus(maxOpenClose).dividedBy(close).toNumber());
  const upperWick = safe(upperWickRaw * upperWickWeight);

  // lowerWick = (min(open, close) - low) / close × weight
  const minOpenClose = Decimal.min(open, close);
  const lowerWickRaw = safe(minOpenClose.minus(low).dividedBy(close).toNumber());
  const lowerWick = safe(lowerWickRaw * lowerWickWeight);

  // range = (high - low) / close
  const range = safe(high.minus(low).dividedBy(close).toNumber());

  // ret = (close - prevClose) / prevClose
  let ret: number;
  if (prevClose === null || prevClose.isZero()) {
    ret = 0;
  } else {
    ret = safe(close.minus(prevClose).dividedBy(prevClose).toNumber());
  }

  return [body, upperWick, lowerWick, range, ret];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * 최근 38개 캔들에서 190차원 피처 벡터를 추출한다.
 *
 * @param candles - 캔들 배열 (newest-last). 38개 미만 시 앞쪽 부족분 0.0 패딩.
 * @param weights - 피처 가중치 오버라이드. 미제공 시 FEATURE_WEIGHTS 기본값 사용.
 * @returns number[190] — 인덱스 i*5+k: k번째 피처(body/upperWick/lowerWick/range/ret)
 */
export function extractCandleFeatures(
  candles: Candle[],
  weights?: Record<string, number>,
): number[] {
  const upperWickWeight = weights?.upperWick ?? FEATURE_WEIGHTS.upperWick ?? 1.0;
  const lowerWickWeight = weights?.lowerWick ?? FEATURE_WEIGHTS.lowerWick ?? 1.0;

  // 출력 배열 초기화 (전체 0)
  const output = new Array<number>(CANDLE_FEATURE_DIM).fill(0);

  if (candles.length === 0) {
    return output;
  }

  // 최대 38개만 사용 (38개 초과 시 가장 최근 38개)
  const usable = candles.length <= CANDLE_BARS ? candles : candles.slice(-CANDLE_BARS);

  // candles[0] → bar[0], candles[k] → bar[k]
  // 38개 미만이면 bar[usable.length..37]이 0 패딩 (뒤쪽 패딩)
  for (let i = 0; i < usable.length; i++) {
    const candle = usable[i];
    if (!candle) continue;
    const prevClose = i > 0 ? (usable[i - 1]?.close ?? null) : null;

    const [body, upperWick, lowerWick, range, ret] = extractBarFeatures(
      candle,
      prevClose,
      upperWickWeight,
      lowerWickWeight,
    );

    const baseIdx = i * CANDLE_FEATURES_PER_BAR;
    output[baseIdx] = body;
    output[baseIdx + 1] = upperWick;
    output[baseIdx + 2] = lowerWick;
    output[baseIdx + 3] = range;
    output[baseIdx + 4] = ret;
  }

  return output;
}
