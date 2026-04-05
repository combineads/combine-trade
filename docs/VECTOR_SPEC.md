# VECTOR_SPEC.md — 202-Dimensional Feature Vector Specification

> PRD v2.0 §7.8 기준. 캔들 190차원(38봉×5피처) + 전략 12차원 = 202차원.

## Overview

Every 5M and 1M closed candle produces a 202-dimensional feature vector (`Vector.embedding`).
The vector is stored as `vector(202)` (pgvector) and used for KNN-based signal validation.

- **Dimension**: 202
- **Source timeframes**: 5M and 1M only
- **Structure**: 190 candle features + 12 strategy features
- **Normalization**: Median/IQR, lookback=60봉, clamp(-3,3) → [0,1]
- **Source code**: `src/vectors/`

## Vector Structure

```
[0..189]   — 캔들 190차원: 38봉 × 5피처
[190..201] — 전략 12차원
```

---

## Part 1: Candle Features (indices 0–189)

38개의 최근 닫힌 캔들에서 봉당 5개 피처를 추출한다. 거래량은 사용하지 않는다.

### 5 features per candle bar

| # | Feature | Formula | Weight | Notes |
|---|---------|---------|--------|-------|
| 0 | `body` | (close − open) / close | 1.0 | 양봉 양수, 음봉 음수 |
| 1 | `upperWick` | (high − max(open, close)) / close | **1.5** | PRD §7.8 가중치 |
| 2 | `lowerWick` | (min(open, close) − low) / close | **1.5** | PRD §7.8 가중치 |
| 3 | `range` | (high − low) / close | 1.0 | 캔들 전체 폭 |
| 4 | `ret` | (close[t] − close[t−1]) / close[t−1] | 1.0 | 수익률 |

### Bar ordering

- bar 0 = 가장 최근 닫힌 캔들 (현재)
- bar 37 = 가장 오래된 캔들
- 인덱스: bar `b`의 feature `f` → `b × 5 + f`

### Index mapping

| Bar | body | upperWick(×1.5) | lowerWick(×1.5) | range | ret |
|-----|------|-----------------|-----------------|-------|-----|
| 0 (최신) | 0 | 1 | 2 | 3 | 4 |
| 1 | 5 | 6 | 7 | 8 | 9 |
| 2 | 10 | 11 | 12 | 13 | 14 |
| ... | ... | ... | ... | ... | ... |
| 37 (최고) | 185 | 186 | 187 | 188 | 189 |

### Warmup requirement

- 최소 38개 닫힌 캔들 필요 (ret 계산에 39번째 캔들의 close 필요)
- 캔들 부족 시 0.0 패딩
- 20% 이상 패딩 벡터는 KNN 학습 제외 (inference는 허용)

---

## Part 2: Strategy Features (indices 190–201)

진입 시점의 기술적 상태를 요약하는 12개 전략 피처. AllIndicators에서 계산.

| # | Index | Name | Description | Weight | Formula |
|---|-------|------|-------------|--------|---------|
| 1 | 190 | `bb20_pos` | BB20(20,2) 내 가격 위치 | 1.0 | (close − bb20_lower) / (bb20_upper − bb20_lower) |
| 2 | 191 | `bb4_pos` | BB4(4,4) 내 가격 위치 | **2.0** | (close − bb4_lower) / (bb4_upper − bb4_lower) |
| 3 | 192 | `ma_ordering` | MA20/60/120 정렬 | 1.0 | +1 if MA20>MA60>MA120 (bullish), −1 if reverse, 0 otherwise |
| 4 | 193 | `ma20_slope` | MA20 기울기 | 1.0 | (MA20[0] − MA20[1]) / MA20[1] |
| 5 | 194 | `atr_separation` | ATR 기반 밴드 이격 | 1.0 | (bb20_upper − bb20_lower) / ATR14 |
| 6 | 195 | `pivot_distance` | 피봇(지지/저항) 거리 | **1.5** | (close − nearest_pivot) / ATR14 |
| 7 | 196 | `rsi_normalized` | RSI14 정규화 | 1.0 | (RSI14 − 50) / 50 |
| 8 | 197 | `rsi_extreme_count` | RSI 극값 카운트 | 1.0 | count(RSI > 70 or RSI < 30) in recent 14 bars / 14 |
| 9 | 198 | `breakout_intensity` | 돌파 강도 | 1.0 | |close − bb20_band| / (bb20_upper − bb20_lower), band 밖이면 양수 |
| 10 | 199 | `disparity_divergence` | 이격 다이버전스 | 1.0 | (close/MA20 − 1) − (RSI14/50 − 1) |
| 11 | 200 | `daily_open_distance` | 일봉 시가 대비 거리 | **1.5** | (close − daily_open) / ATR14 |
| 12 | 201 | `session_box_position` | 세션 박스 내 위치 | **1.5** | (close − session_low) / (session_high − session_low) |

> **가중치(Weight)**: 벡터 값 자체에 곱해서 저장. KNN 거리 계산 시 해당 차원의 영향력이 증가.

---

## Normalization (PRD §3.1 ANCHOR)

모든 피처는 Median/IQR 정규화 후 [0, 1] 범위로 변환.

```
ANCHOR normalization: { method: "median_iqr", lookback: 60 }
```

### Steps

1. **Median/IQR 계산**: lookback=60봉의 동일 피처 값에서 median, IQR 산출
2. **정규화**: `normalized = (x − median) / IQR`
3. **클램핑**: `clamped = clamp(normalized, −3, +3)`
4. **[0,1] 변환**: `final = (clamped + 3) / 6`

### Edge cases

- `IQR == 0` → 상수 피처, `final = 0.5` (중앙값)
- lookback 60봉 미만 시 가용 데이터로 계산 (최소 10봉)
- 가용 데이터 10봉 미만 시 `final = 0.5`

---

## FEATURE_WEIGHT CommonCode Mapping (PRD §3.2)

`FEATURE_WEIGHT` CommonCode 그룹은 **개별 피처 단위** 가중치를 관리.

| code | value | 적용 피처 |
|------|-------|----------|
| `bb4_position` | `2.0` | bb4_pos (index 191) |
| `upperWick` | `1.5` | upperWick (indices 1, 6, 11, ..., 186) |
| `lowerWick` | `1.5` | lowerWick (indices 2, 7, 12, ..., 187) |
| `daily_open_distance` | `1.5` | daily_open_distance (index 200) |
| `session_box_position` | `1.5` | session_box_position (index 201) |
| `pivot_distance` | `1.5` | pivot_distance (index 195) |
| `default` | `1.0` | 나머지 모든 피처 |

> 가중치는 벡터 생성 시 피처 값에 곱해서 적용. WFO 튜닝 대상 (ANCHOR 그룹은 불변).

---

## Appendix: 김직선 매매법 매핑 (PRD Appendix A)

| 요소 | 벡터 반영 |
|------|----------|
| **더** (Double-BB) | bb20_pos, bb4_pos(×2.0) |
| **캔** (캔들) | 38봉 body/upperWick(×1.5)/lowerWick(×1.5)/range/ret |
| **이** (이평선) | ma_ordering, ma20_slope |
| **지** (지지저항) | pivot_distance(×1.5), daily_open_distance(×1.5), session_box_position(×1.5) |
| **추** (추세) | ma_ordering, ma20_slope + 38봉 ret 시퀀스 |
| **격** (다이버전스) | rsi_normalized, rsi_extreme_count, disparity_divergence |
| **깨** (돌파) | breakout_intensity, atr_separation |

---

## Data Requirements

| Requirement | Minimum |
|-------------|---------|
| 5M closed candles | 39 (38 bars + 1 for ret of oldest bar) |
| 1M closed candles | 39 |
| Normalization lookback | 60 candles of same timeframe |
| AllIndicators warmup | BB20(20), BB4(4), MA120(120), RSI14(14), ATR14(14) |

**총 최소 요구**: 120개 닫힌 캔들 (MA120 warmup이 bottleneck)

---

## Change History

| Date | Author | Change |
|------|--------|--------|
| 2026-04-04 | T-05-000 | Initial specification — 6 categories, 202 features |
| 2026-04-05 | PRD alignment | **전면 재작성** — PRD §7.8 기준 38봉×5(190) + 12전략(12) 구조로 복원. 정규화 clamp(-3,3)→[0,1], lookback=60. FEATURE_WEIGHT 개별 피처 단위로 변경 |
