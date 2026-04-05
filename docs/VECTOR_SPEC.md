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

| # | Index | Name | Description | Weight | Formula | Audit |
|---|-------|------|-------------|--------|---------|-------|
| 1 | 190 | `bb20_pos` | BB20(20,2) 내 가격 위치 | 1.0 | (close − bb20_lower) / (bb20_upper − bb20_lower) | — |
| 2 | 191 | `bb4_pos` | BB4(4,4) 내 가격 위치 | **2.0** | (close − bb4_lower) / (bb4_upper − bb4_lower) | — |
| 3 | 192 | `ma_ordering` | MA20/60/120 정렬 | 1.0 | +1 if MA20>MA60>MA120 (bullish), −1 if reverse, 0 otherwise | — |
| 4 | 193 | `ma20_slope` | MA20 기울기 | 1.0 | (MA20[0] − MA20[1]) / MA20[1] | — |
| 5 | 194 | `atr_separation` | ATR 기반 밴드 이격 | 1.0 | **(bb20_upper − bb20_lower) / ATR14** | D-001 확정 |
| 6 | 195 | `pivot_distance` | 피봇(지지/저항) 거리 | **1.5** | (close − nearest_pivot) / ATR14 | — |
| 7 | 196 | `rsi_normalized` | RSI14 정규화 | 1.0 | (RSI14 − 50) / 50 | — |
| 8 | 197 | `rsi_extreme_count` | RSI 극값 카운트 | 1.0 | **count(RSI > 70 or RSI < 30) in recent 14 bars / 14** | D-002 확정 |
| 9 | 198 | `breakout_intensity` | 돌파 강도 | 1.0 | **\|close − bb20_band\| / (bb20_upper − bb20_lower), band 밖이면 양수** | D-003 확정 |
| 10 | 199 | `disparity_divergence` | 이격 다이버전스 | 1.0 | **(close/MA20 − 1) − (RSI14/50 − 1)** | D-004 확정 |
| 11 | 200 | `daily_open_distance` | 일봉 시가 대비 거리 | **1.5** | (close − daily_open) / ATR14 | — |
| 12 | 201 | `session_box_position` | 세션 박스 내 위치 | **1.5** | (close − session_low) / (session_high − session_low) | — |

> **가중치(Weight)**: 벡터 값 자체에 곱해서 저장. KNN 거리 계산 시 해당 차원의 영향력이 증가.
>
> **Audit 컬럼**: D-001~D-004는 T-15-001 감사에서 PRD 원문 기준으로 확정된 수식. 코드(features.ts)의 주석과 다를 수 있으며, M2(strategy-features.ts 구현)에서 이 수식을 기준으로 구현한다.

---

## Formula Audit Notes (T-15-001, 2026-04-05)

PRD §7.8은 피처명만 열거하고 수식 상세를 명시하지 않는다. 따라서 피처의 **의미론적 의도**, **이름 어원**, **전략 맥락**을 기준으로 VECTOR_SPEC.md(문서)와 features.ts(코드) 간 충돌 4건을 해소한다.

### D-001 — `atr_separation` 수식

| 출처 | 수식 |
|------|------|
| VECTOR_SPEC (이전) | `(bb20_upper − bb20_lower) / ATR14` |
| features.ts 주석 | `(bb4_upper - bb4_lower) / atr14` |
| **확정 (PRD 의도)** | **(bb20_upper − bb20_lower) / ATR14** |

**근거**: 피처명 `atr_separation`은 "ATR 단위로 본 밴드 이격"을 의미한다. 전략의 외곽 밴드는 BB20이며, BB20 밴드 폭을 ATR14로 나누는 것이 피처 의도와 일치한다. features.ts 주석의 BB4 사용은 내부 밴드를 참조하여 의미론적으로 부정확하다.

### D-002 — `rsi_extreme_count` 수식

| 출처 | 수식 |
|------|------|
| VECTOR_SPEC (이전) | `count(RSI > 70 or RSI < 30) in recent 14 bars / 14` |
| features.ts 주석 | `count of bars in last 5 where rsi14 > 70 or < 30 (0–5)` |
| **확정 (PRD 의도)** | **count(RSI > 70 or RSI < 30) in recent 14 bars / 14** |

**근거**: 피처는 RSI14를 사용하므로 RSI 계산 기간(14봉)과 동일한 윈도우를 사용하는 것이 일관성 있다. features.ts의 5봉 윈도우는 기간이 지나치게 짧아 극값 감지 신뢰도가 낮다. 14로 나누어 [0, 1] 범위로 정규화된다.

### D-003 — `breakout_intensity` 수식

| 출처 | 수식 |
|------|------|
| VECTOR_SPEC (이전) | `\|close − bb20_band\| / (bb20_upper − bb20_lower), band 밖이면 양수` |
| features.ts 주석 | `(close - bb20_upper) / atr14 if above upper, (bb20_lower - close) / atr14 if below lower, else 0` |
| **확정 (PRD 의도)** | **\|close − bb20_band\| / (bb20_upper − bb20_lower), band 밖이면 양수** |

**근거**: "돌파 강도"는 밴드 내에서의 상대적 위치를 측정해야 한다. BB20 밴드 폭으로 정규화하면 현재 밴드 상태에서의 돌파 정도를 상대적으로 측정한다. ATR14로 정규화하는 features.ts 방식은 변동성 단위의 절대값이며, 밴드 폭 기반 정규화보다 피처명의 의미와 덜 일치한다.

### D-004 — `disparity_divergence` 수식

| 출처 | 수식 |
|------|------|
| VECTOR_SPEC (이전) | `(close/MA20 − 1) − (RSI14/50 − 1)` |
| features.ts 주석 | `bb4_pct_b_5m - bb20_pct_b_5m` |
| **확정 (PRD 의도)** | **(close/MA20 − 1) − (RSI14/50 − 1)** |

**근거**: 피처명 `disparity_divergence`는 두 개념의 합성어다: "이격(disparity)" = close/MA20 이격도, "다이버전스(divergence)" = 가격 이격과 RSI 이격의 차이. features.ts의 `bb4_pct_b - bb20_pct_b`는 내외 밴드 위치 차이로 의미가 다르다 (이름은 `band_divergence`가 더 적절). PRD의 "**격** (다이버전스)" 요소가 rsi_normalized + rsi_extreme_count와 함께 이 피처를 포함하므로, RSI를 포함한 VECTOR_SPEC 수식이 전략 맥락과 일치한다.

---

## pgvector Weighted Distance Strategy (D-005)

pgvector의 native `<=>` / `<->` 연산자는 피처별 가중치를 지원하지 않는다. 두 가지 전략을 검토한다.

### 옵션 비교

| 항목 | Pre-multiply | Post-rerank |
|------|-------------|------------|
| **방식** | 저장 전 `feature × sqrt(weight)` 곱함 | pgvector로 top-K 후보 검색 후 앱에서 가중 거리 재계산 |
| **HNSW 인덱스** | 완전 호환 (저장된 벡터 공간에서 L2 = weighted L2) | 호환 (단, 근사 검색 후 재랭킹) |
| **가중치 변경 시** | 전체 벡터 재생성 필요 | 재생성 불필요, 앱 코드만 수정 |
| **정밀도** | HNSW 근사 오차 최소 (가중치가 인덱스에 반영됨) | HNSW 근사 후 재랭킹이므로 경계 케이스에서 순위 오류 가능 |
| **구현 복잡도** | 낮음 (저장 시 곱하기만) | 높음 (앱 레이어 재랭킹 로직 추가) |
| **WFO 튜닝** | 가중치 변경 = 벡터 재생성 트리거 | 가중치 변경 = 앱 코드 변경만 |

### 결정: Pre-multiply 채택 (D-005)

**채택 근거**:
1. HNSW 인덱스와 완전 호환 — 저장된 벡터 공간에서 L2 거리 = 원본 공간에서 가중 L2 거리. 수학적으로 `||sqrt(w) * x - sqrt(w) * y||² = Σ w_i(x_i - y_i)²`.
2. 구현 단순 — 저장 시 `feature_value * sqrt(weight)`만 곱하면 됨. 검색 쿼리 코드 변경 없음.
3. 정밀도 우수 — 인덱스 자체가 가중 공간을 학습하므로 HNSW 근사 오차가 가중치 의도와 일치.
4. Post-rerank는 top-K 후보에서 순위 역전이 발생할 수 있으며, K를 크게 가져가야 하는 오버헤드가 있다.

**트레이드오프 수용**:
- 가중치 변경 시 전체 벡터 재생성 필요. 단, FEATURE_WEIGHT는 WFO 튜닝 대상이고 ANCHOR 그룹은 불변이므로, 가중치 변경은 WFO 주기(수주~수개월)에 한 번 발생한다. 재생성 스크립트(M5)가 이를 처리한다.

**구현 방식**: `vectorize()` 출력 시 각 피처 값에 `sqrt(weight)` 곱한 후 Float32Array로 저장. KNN 검색은 pgvector `<->` (L2) 사용.

---

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
| 2026-04-05 | T-15-001 | **전략 피처 수식 감사** — 충돌 4건(atr_separation/rsi_extreme_count/breakout_intensity/disparity_divergence) PRD 의도 기준으로 확정(D-001~D-004). pgvector 가중 거리 전략 pre-multiply 결정(D-005). Formula Audit Notes 섹션 + pgvector Weighted Distance Strategy 섹션 추가 |
