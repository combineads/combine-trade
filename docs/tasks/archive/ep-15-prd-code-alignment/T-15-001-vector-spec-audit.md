# T-15-001 VECTOR_SPEC 검증 + 전략 피처 수식 감사 + pgvector 가중 거리 결정

## Metadata
- modules: [vectors, config]
- primary: vectors

## Goal
VECTOR_SPEC.md의 12 전략 피처 수식을 PRD v2.0 §7.8 원문과 1:1 대조하여 충돌 4건을 해소하고, pgvector 가중 거리 전략(pre-multiply vs post-rerank)을 결정한다.

## Why
현재 VECTOR_SPEC.md와 코드(features.ts:286-299) 사이에 4건의 수식 불일치가 있다. PRD가 source of truth이므로, PRD 원문 기준으로 수식을 확정해야 후속 M2(피처 추출기) 구현이 정확하다.

## Inputs
- `docs/specs/combine-trade-prd-v2.0-final.md` §7.8
- `docs/VECTOR_SPEC.md`
- `src/vectors/features.ts` (STRATEGY 배열, 286-299행)

## Dependencies
- 없음 (EP-15 첫 태스크)

## Expected Outputs
- 수정된 `docs/VECTOR_SPEC.md` (4건 수식 확정)
- EP-15 Decision log에 5건 결정 기록 (4건 수식 + 1건 pgvector 전략)

## Deliverables
- `docs/VECTOR_SPEC.md` — 12 전략 피처 수식이 PRD §7.8과 1:1 대응
- `docs/exec-plans/15-prd-code-alignment.md` Decision log 업데이트

## Constraints
- PRD 원문이 source of truth. VECTOR_SPEC나 코드가 다르면 PRD를 따른다.
- 코드 변경 없음 — 문서 감사만 수행

## Steps
1. PRD §7.8의 12 전략 피처 명세를 추출한다
2. VECTOR_SPEC.md의 12 전략 피처 수식과 1:1 대조한다
3. 4건 충돌을 PRD 원문 기준으로 해소한다:
   - `atr_separation`: VECTOR_SPEC vs 코드 vs PRD
   - `rsi_extreme_count`: VECTOR_SPEC vs 코드 vs PRD
   - `disparity_divergence`: VECTOR_SPEC vs 코드 vs PRD
   - `breakout_intensity`: VECTOR_SPEC vs 코드 vs PRD
4. pgvector 가중 거리 전략을 결정한다 (pre-multiply vs post-rerank), 장단점 분석 후 Decision log 기록
5. VECTOR_SPEC.md를 갱신한다
6. EP-15 Decision log에 5건 결정을 기록한다

## Acceptance Criteria
- VECTOR_SPEC.md의 12 전략 피처 수식이 PRD §7.8 원문과 1:1 대응
- 4건 충돌이 각각 근거와 함께 Decision log에 기록됨
- pgvector 가중 거리 전략이 Decision log에 기록됨

## Test Scenarios
N/A — 문서 감사 태스크

## Validation
- VECTOR_SPEC.md vs PRD §7.8 수동 대조 (12 전략 피처 × 수식 1:1 매칭 확인)
- Decision log에 5건 결정 기록 확인

## Out of Scope
- 코드 변경 (M2에서 수행)
- 캔들 190차원 구조 설계 (이미 PRD에 확정)
- 정규화 파라미터 변경 (normalizer.ts 이미 PRD 일치)

## Implementation Notes

PRD §7.8은 12개 전략 피처명만 열거하고 수식 상세를 명시하지 않는다. 따라서 감사 기준을 "피처의 의미론적 의도 + 이름 어원 + 전략 맥락"으로 설정하고, VECTOR_SPEC.md(문서)와 features.ts(코드) 간 충돌 4건을 판정했다.

**판정 결과 요약**:

| 피처 | VECTOR_SPEC 수식 | features.ts 주석 | 채택 | 근거 |
|------|-----------------|-----------------|------|------|
| `atr_separation` | (bb20_upper − bb20_lower) / ATR14 | (bb4_upper − bb4_lower) / atr14 | **VECTOR_SPEC** | BB20이 전략 외곽 밴드. BB4 참조는 의미론적 부정확 |
| `rsi_extreme_count` | 14봉 / 14 (정규화됨) | 5봉 / 미정규화 (0~5) | **VECTOR_SPEC** | RSI14 계산 기간과 윈도우 일관성. /14 정규화로 [0,1] 범위 |
| `breakout_intensity` | 밴드 폭 정규화 (상대적) | ATR14 정규화 (절대적) | **VECTOR_SPEC** | 밴드 폭 정규화 = 현재 밴드 상태 대비 상대적 돌파 강도. 피처명 의도와 일치 |
| `disparity_divergence` | (close/MA20−1) − (RSI14/50−1) | bb4_pct_b − bb20_pct_b | **VECTOR_SPEC** | "이격(disparity)"=가격/MA, "다이버전스(divergence)"=가격이격 vs RSI이격 차이. features.ts 수식은 `band_divergence`에 더 적합 |

**pgvector 가중 거리**: Pre-multiply 채택. 수학적 근거: `sqrt(w)` 곱해서 저장 시 L2 거리 = 원본 공간의 가중 L2. HNSW 완전 호환. 구현 단순. 트레이드오프(가중치 변경 시 재생성 필요)는 WFO 주기 특성상 수용 가능.

8개 피처(bb20_pos, bb4_pos, ma_ordering, ma20_slope, pivot_distance, rsi_normalized, daily_open_distance, session_box_position)는 VECTOR_SPEC과 코드가 일치하므로 그대로 확정.

## Outputs

- `docs/VECTOR_SPEC.md` — 전략 피처 테이블에 Audit 컬럼 추가, Formula Audit Notes 섹션(D-001~D-004) 신규 추가, pgvector Weighted Distance Strategy 섹션(D-005) 신규 추가, Change History 갱신
- `docs/exec-plans/15-prd-code-alignment.md` — Decision log에 D-001~D-005 5건 기록, PRD 커버리지 테이블 §7.8 상태 갱신, Progress notes 갱신
