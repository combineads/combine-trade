/**
 * 12 전략 피처 추출기 (PRD §7.8, VECTOR_SPEC.md Part 2)
 *
 * 출력: number[12]
 * 인덱스 레이아웃:
 *   [0]  bb20_pos           — BB20 내 가격 위치, [-1,1]
 *   [1]  bb4_pos            — BB4 내 가격 위치, [-1,1] × weight 2.0
 *   [2]  ma_ordering        — MA20/60/120 정렬: +1 / 0 / -1
 *   [3]  ma20_slope         — MA20 3봉 기울기
 *   [4]  atr_separation     — (bb20_upper - bb20_lower) / ATR14 [D-001]
 *   [5]  pivot_distance     — (close - nearest_pivot) / ATR14 × weight 1.5
 *   [6]  rsi_normalized     — (RSI14 - 50) / 50
 *   [7]  rsi_extreme_count  — count(RSI>70 or RSI<30) in recent 14 bars / 14 [D-002]
 *   [8]  breakout_intensity — |close - bb20_band| / (bb20_upper - bb20_lower) [D-003]
 *   [9]  disparity_divergence — (close/MA20 - 1) - (RSI14/50 - 1) [D-004]
 *   [10] daily_open_distance — (close - daily_open) / ATR14 × weight 1.5
 *   [11] session_box_position — session box 내 위치, [-1,1] × weight 1.5
 *
 * null 지표 → 0.0 반환.
 * 모든 가격 계산은 Decimal.js 사용.
 */

import Decimal from "decimal.js";
import type { Candle } from "@/core/types";
import type { AllIndicators } from "@/indicators/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const STRATEGY_FEATURE_DIM = 12 as const;

const WEIGHT_BB4_POS = 2.0;
const WEIGHT_PIVOT_DISTANCE = 1.5;
const WEIGHT_DAILY_OPEN_DISTANCE = 1.5;
const WEIGHT_SESSION_BOX_POSITION = 1.5;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** NaN / Infinity → 0.0 */
function safe(v: number): number {
  return Number.isFinite(v) ? v : 0.0;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * 현재 캔들, 캔들 히스토리, AllIndicators에서 12개 전략 피처를 추출한다.
 *
 * @param candle      - 현재(최신) 캔들
 * @param candles     - 캔들 배열 (newest-last). 피봇/RSI 극값 계산에 사용 (최근 14봉 사용)
 * @param indicators  - 현재 봉의 AllIndicators
 * @param symbolState - 심볼 상태 (daily_open, session_box_high/low). 미제공 시 null로 처리
 * @returns number[12] — 인덱스 순서는 VECTOR_SPEC.md Part 2 기준
 */
export function extractStrategyFeatures(
  candle: Candle,
  candles: Candle[],
  indicators: AllIndicators,
  symbolState?: {
    daily_open?: Decimal | null;
    session_box_high?: Decimal | null;
    session_box_low?: Decimal | null;
  },
): number[] {
  const close = candle.close;
  const output = new Array<number>(STRATEGY_FEATURE_DIM).fill(0.0);

  // ---- [0] bb20_pos: (bb20_pct_b * 2) - 1, mapped to [-1, 1] ----
  {
    const bb20 = indicators.bb20;
    if (bb20 !== null) {
      const raw = safe(bb20.percentB.times(new Decimal("2")).minus(new Decimal("1")).toNumber());
      output[0] = safe(raw);
    }
  }

  // ---- [1] bb4_pos: (bb4_pct_b * 2) - 1, mapped to [-1, 1] × weight 2.0 ----
  {
    const bb4 = indicators.bb4;
    if (bb4 !== null) {
      const raw = safe(bb4.percentB.times(new Decimal("2")).minus(new Decimal("1")).toNumber());
      output[1] = safe(raw * WEIGHT_BB4_POS);
    }
  }

  // ---- [2] ma_ordering: sma20 > sma60 > sma120 → 1, reversed → -1, else 0 ----
  {
    const sma20 = indicators.sma20;
    const sma60 = indicators.sma60;
    const sma120 = indicators.sma120;
    if (sma20 !== null && sma60 !== null && sma120 !== null) {
      if (sma20.greaterThan(sma60) && sma60.greaterThan(sma120)) {
        output[2] = 1;
      } else if (sma20.lessThan(sma60) && sma60.lessThan(sma120)) {
        output[2] = -1;
      } else {
        output[2] = 0;
      }
    }
  }

  // ---- [3] ma20_slope: (sma20[0] - sma20[3]) / sma20[3] (3-bar slope) ----
  // AllIndicators에 prevSma20(직전 봉)만 제공되므로 1봉 기울기로 근사한다.
  // 3봉 전 값을 얻기 위한 별도 히스토리가 없는 경우, prevSma20을 사용한다.
  {
    const sma20 = indicators.sma20;
    const prevSma20 = indicators.prevSma20;
    if (sma20 !== null && prevSma20 !== null && !prevSma20.isZero()) {
      const slope = sma20.minus(prevSma20).dividedBy(prevSma20);
      output[3] = safe(slope.toNumber());
    }
  }

  // ---- [4] atr_separation: (bb20_upper - bb20_lower) / ATR14 [D-001] ----
  {
    const bb20 = indicators.bb20;
    const atr14 = indicators.atr14;
    if (bb20 !== null && atr14 !== null && !atr14.isZero()) {
      const bandWidth = bb20.upper.minus(bb20.lower);
      const sep = bandWidth.dividedBy(atr14);
      output[4] = safe(sep.toNumber());
    }
  }

  // ---- [5] pivot_distance: (close - nearest_pivot) / ATR14 × weight 1.5 ----
  // nearest_pivot = 최근 20개 캔들(현재 포함)에서 가장 가까운 highest_high 또는 lowest_low
  {
    const atr14 = indicators.atr14;
    if (atr14 !== null && !atr14.isZero()) {
      // 현재 캔들 포함 최근 20개 (candles 배열이 newest-last이므로 마지막 19개 + current candle)
      const slice = candles.length > 0 ? candles.slice(-19) : [];
      const allCandles = [...slice, candle];

      // allCandles는 최소 1개(candle) 이상 존재
      let highestHigh = allCandles[0]?.high ?? candle.high;
      let lowestLow = allCandles[0]?.low ?? candle.low;

      for (const c of allCandles) {
        if (c.high.greaterThan(highestHigh)) highestHigh = c.high;
        if (c.low.lessThan(lowestLow)) lowestLow = c.low;
      }

      const distToHigh = close.minus(highestHigh).abs();
      const distToLow = close.minus(lowestLow).abs();
      const nearestPivot = distToHigh.lessThanOrEqualTo(distToLow) ? highestHigh : lowestLow;

      const raw = close.minus(nearestPivot).dividedBy(atr14);
      output[5] = safe(raw.toNumber() * WEIGHT_PIVOT_DISTANCE);
    }
  }

  // ---- [6] rsi_normalized: (RSI14 - 50) / 50 → [-1, 1] ----
  {
    const rsi14 = indicators.rsi14;
    if (rsi14 !== null) {
      const normalized = rsi14.minus(new Decimal("50")).dividedBy(new Decimal("50"));
      output[6] = safe(normalized.toNumber());
    }
  }

  // ---- [7] rsi_extreme_count: count(RSI>70 or RSI<30) in recent 14 bars / 14 [D-002] ----
  // AllIndicators에는 현재 봉의 rsi14만 있으므로 현재값 기준으로 0 또는 1/14 반환.
  // 완전한 구현은 rsi14 히스토리가 필요하다 (현재 아키텍처에서 미지원).
  {
    const rsi14 = indicators.rsi14;
    if (rsi14 !== null) {
      const rsiVal = rsi14.toNumber();
      const isExtreme = rsiVal > 70 || rsiVal < 30 ? 1 : 0;
      output[7] = safe(isExtreme / 14);
    }
  }

  // ---- [8] breakout_intensity: |close - bb20_band| / (bb20_upper - bb20_lower) [D-003] ----
  // close가 band 밖이면 양수, 안이면 0
  {
    const bb20 = indicators.bb20;
    if (bb20 !== null) {
      const bandWidth = bb20.upper.minus(bb20.lower);
      if (!bandWidth.isZero()) {
        let intensity = 0.0;
        if (close.greaterThan(bb20.upper)) {
          // 상단 돌파: |close - upper| / band_width
          intensity = safe(close.minus(bb20.upper).abs().dividedBy(bandWidth).toNumber());
        } else if (close.lessThan(bb20.lower)) {
          // 하단 돌파: |close - lower| / band_width
          intensity = safe(close.minus(bb20.lower).abs().dividedBy(bandWidth).toNumber());
        }
        // 밴드 내부: 0.0
        output[8] = intensity;
      }
    }
  }

  // ---- [9] disparity_divergence: (close/MA20 - 1) - (RSI14/50 - 1) [D-004] ----
  {
    const sma20 = indicators.sma20;
    const rsi14 = indicators.rsi14;
    if (sma20 !== null && !sma20.isZero() && rsi14 !== null) {
      const disparity = close.dividedBy(sma20).minus(new Decimal("1"));
      const rsiTerm = rsi14.dividedBy(new Decimal("50")).minus(new Decimal("1"));
      const divergence = disparity.minus(rsiTerm);
      output[9] = safe(divergence.toNumber());
    }
  }

  // ---- [10] daily_open_distance: (close - daily_open) / ATR14 × weight 1.5 ----
  {
    const dailyOpen = symbolState?.daily_open ?? null;
    const atr14 = indicators.atr14;
    if (dailyOpen !== null && atr14 !== null && !atr14.isZero()) {
      const raw = close.minus(dailyOpen).dividedBy(atr14);
      output[10] = safe(raw.toNumber() * WEIGHT_DAILY_OPEN_DISTANCE);
    }
  }

  // ---- [11] session_box_position: (close - session_low) / (session_high - session_low) ----
  //           mapped to [-1, 1] × weight 1.5
  {
    const sessionHigh = symbolState?.session_box_high ?? null;
    const sessionLow = symbolState?.session_box_low ?? null;
    if (sessionHigh !== null && sessionLow !== null) {
      const boxHeight = sessionHigh.minus(sessionLow);
      if (!boxHeight.isZero()) {
        const ratio = close.minus(sessionLow).dividedBy(boxHeight);
        // [0, 1] → [-1, 1]: ratio * 2 - 1
        const mapped = ratio.times(new Decimal("2")).minus(new Decimal("1"));
        output[11] = safe(mapped.toNumber() * WEIGHT_SESSION_BOX_POSITION);
      }
    }
  }

  return output;
}
