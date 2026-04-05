# EP-18: PRD v2.0 P0 치명적 불일치 수정

## Objective

PRD v2.0 검증 보고서(`docs/reviews/prd-v2-alignment-review.md`)에서 식별된 P0 치명적 불일치 9건을 수정한다. 김직선 선생님이 확정한 전략 사양이므로 **PRD가 절대 기준**이며, "코드가 더 나을 수 있다"는 판단을 적용하지 않는다.

수정하지 않으면 봇이 돈을 잃는 항목들이다:
- Safety Gate가 위험 캔들을 통과시키고 안전 캔들을 차단 (비교 반전 2건)
- 벡터 공간이 PRD와 다른 수식으로 구축됨 (캔들 피처 분모 4건)
- 손실 한도가 즉시 트리거되거나 리셋되지 않음
- KNN 학습 데이터에 라벨이 없음
- FSM 상태 전이가 DB에 기록되지 않음

## Scope

| 수정 ID | 항목 | 모듈 | 파일 |
|---------|------|------|------|
| F-01 | Safety Gate Rule 1: wick_ratio `gt`→`lt` | signals (L5) | `src/signals/safety-gate.ts` |
| F-02 | Safety Gate Rule 2: 박스권 극성 반전 | signals (L5) | `src/signals/safety-gate.ts` |
| F-03 | 캔들 피처 body 분모 close→open | vectors (L3) | `src/vectors/candle-features.ts` |
| F-04 | 캔들 피처 upperWick 분모 close→high | vectors (L3) | `src/vectors/candle-features.ts` |
| F-05 | 캔들 피처 lowerWick 분모 close→high | vectors (L3) | `src/vectors/candle-features.ts` |
| F-06 | 캔들 ���처 range 분모 close→low | vectors (L3) | `src/vectors/candle-features.ts` |
| F-07 | Daily Loss Limit balance 인자 오류 | daemon (L9) | `src/daemon/pipeline.ts` |
| F-08 | 손실 카운터 리셋 daemon 미연결 | daemon (L9) + limits (L5) | `src/daemon/pipeline.ts` 또는 `src/daemon.ts` |
| F-09 | Vector 라벨링 미연결 (단일 TX) | positions (L5) + labeling (L6) | `src/positions/ticket-manager.ts` |
| F-10 | 일봉 방향 횡보(>=) 미허용 | filters (L4) | `src/filters/daily-direction.ts` |
| F-11 | TP1/TP2 체크 5M close 한정 | daemon (L9) | `src/daemon/pipeline.ts` |
| F-12 | 트레일링 SL 갱신 1H close 한정 | daemon (L9) | `src/daemon/pipeline.ts` |
| F-13 | FSM IDLE→WATCHING 전이 기록 | signals (L5) | `src/signals/watching.ts` |
| F-14 | FSM WATCHING→IDLE 전이 기록 | signals (L5) | `src/signals/watching.ts` |

## Non-goals

- P1/P2 불일치 항목 (WatchSession 조건 A/B, 경제지표 API, Slack 긴급 마커 등)
- 벡터 DB 마이그레이션/재구축 (F-03~06 수정 후 별도 에픽)
- WFO 통과 게이트 / CommonCode 반영 (별도 에픽)
- 테스트 커버리지 확대 (각 태스크 내에서 해당 수정의 테스트만)

## Prerequisites

- EP-01~15 완료 (현재 코드베이스가 기본 기능 구현 완료 상태)
- PRD v2.0 최종본 (`docs/specs/combine-trade-prd-v2.0-final.md`) 확정

## Milestones

### M1 — Signal Pipeline 교정 (F-01, F-02, F-10)

Safety Gate 비교 반전 2건 + 일봉 방향 등호 처리. 신호 판정의 근본 로직 수정.

**Deliverables:**
- `safety-gate.ts`: Rule 1 `gt(wick, threshold)` → `lt(wick, threshold)` (L97)
- `safety-gate.ts`: Rule 2 극성 반전 — 중심 근접 시 차단, 중심 이탈 시 허용 (L114-133)
- `daily-direction.ts`: slope=0 시 기존 방향 유지 (`>=` / `<=` 허용) (L34-38)
- 각 수정에 대한 단위 테스트 추가/수정

**Acceptance criteria:**
- [ ] `checkWickRatio()`: wick < threshold AND 역추세 → 차단됨
- [ ] `checkWickRatio()`: wick > threshold → 통과됨
- [ ] `checkWickRatio()`: 순추세 → 항상 통과
- [ ] `checkBoxRange()`: |close - sma20| < range_20 × 0.15 → 차단됨
- [ ] `checkBoxRange()`: |close - sma20| >= range_20 × 0.15 → 통과됨
- [ ] `determineDailyBias()`: slope=0 AND close >= open → LONG_ONLY
- [ ] `determineDailyBias()`: slope=0 AND close <= open → SHORT_ONLY
- [ ] `determineDailyBias()`: slope > 0 AND close > open → LONG_ONLY (기존 동작 유지)
- [ ] 기존 safety-gate 테스트 통과 또는 PRD 기준으로 갱신

**Validation:**
```bash
bun test src/signals/safety-gate.test.ts
bun test src/filters/daily-direction.test.ts
bun run typecheck
```

### M2 — Vector Space PRD 정렬 (F-03~F-06)

캔들 피처 4개 분모를 PRD 수식에 맞춤. 벡터 공간 자체가 변경되므로 기존 벡터 DB는 무효화됨.

**Deliverables:**
- `candle-features.ts:65`: body = `(C-O)/O` → open으로 분모 변경 (open=0 가드 추가)
- `candle-features.ts:69`: upperWick = `(H-max(O,C))/H` → high로 분모 변경 (high=0 가드 추가)
- `candle-features.ts:74`: lowerWick = `(min(O,C)-L)/H` → high로 분모 변경
- `candle-features.ts:78`: range = `(H-L)/L` → low로 분모 변경 (low=0 가드 추가)
- 단위 테스트 추가: 알려진 캔들 → 정확한 피처 값 검증
- 주석에 PRD §7.8 수식 명시

**Acceptance criteria:**
- [ ] body: open=100, close=105 → (105-100)/100 = 0.05 (not /105)
- [ ] upperWick: H=110, max(O,C)=105 → (110-105)/110 ≈ 0.0455 (not /105)
- [ ] lowerWick: min(O,C)=100, L=95 → (100-95)/110 ≈ 0.0455 (not /105)
- [ ] range: H=110, L=95 → (110-95)/95 ≈ 0.1579 (not /105)
- [ ] open=0 → body=0 (안전 가드)
- [ ] high=0 → upperWick=0, lowerWick=0 (안전 가드)
- [ ] low=0 → range=0 (안전 가드)
- [ ] 202차원 벡터 생성 정상 (총 차원 수 불변)

**Validation:**
```bash
bun test src/vectors/candle-features.test.ts
bun test src/vectors/vectorizer.test.ts
bun run typecheck
```

### M3 — Risk Management 교정 (F-07, F-08)

Daily Loss Limit balance 인자 오류 수정 + 손실 카운터 리셋 daemon 연결.

**Deliverables:**
- `pipeline.ts:660`: `checkLossLimit(lossState, symbolState.losses_today, ...)` → 실제 account balance 전달
- `checkAccountDailyLimit()` pipeline 진입부에 호출 추가 (전 심볼×거래소 합산)
- daemon에 `resetAllExpired()` 호출 연결: 1분 또는 1H close 주기
  - daily: UTC 00:00 경과 시 리셋
  - hourly: 매 정시 경과 시 리셋
  - session: trade block(장 개장) 시작 시 리셋
- 리셋 로직의 `LastResets` 상태를 daemon에서 관리

**Acceptance criteria:**
- [ ] `checkLossLimit()` 두 번째 인자가 exchange adapter에서 가져온 실제 잔고
- [ ] balance=$10,000, losses_today=$900 → 허용 (900 < 10000×10%)
- [ ] balance=$10,000, losses_today=$1,000 → 차단 (1000 >= 10000×10%)
- [ ] `checkAccountDailyLimit()` 호출 확인 (전 심볼 합산)
- [ ] UTC 00:00 경과 → losses_today 리셋 확인
- [ ] 매 정시 경과 → losses_this_1h_5m, losses_this_1h_1m 리셋 확인
- [ ] 리셋 후 카운터 = 0 검증

**Validation:**
```bash
bun test src/limits/loss-limit.test.ts
bun test src/daemon/pipeline.test.ts
bun run typecheck
```

### M4 — Position Lifecycle 무결성 (F-09, F-11, F-12, F-13, F-14)

Vector 라벨링 연결, TP/트레일링 타임프레임 가드, FSM 전이 DB 기록.

**Deliverables:**
- `ticket-manager.ts`: `closeTicket()` 내에서 `finalizeLabel()` 호출, **단일 트랜잭션**
- `pipeline.ts`: TP1/TP2 체크를 `timeframe === "5M"` 일 때만 실행
- `pipeline.ts`: 트레일링 SL 갱신을 `timeframe === "1H"` 일 때만 실행
- `watching.ts`: `openWatchSession()` 내에서 `symbol_state.fsm_state = 'WATCHING'` SET
- `watching.ts`: `invalidateWatchSession()` 내에서 `symbol_state.fsm_state = 'IDLE'` SET (active ticket 없을 때)

**Acceptance criteria:**
- [ ] Ticket CLOSED → 동일 트랜잭션 내에서 Vector.label + Vector.grade 갱신 확인
- [ ] 1M candle close → TP1/TP2 체크 스킵 확인
- [ ] 1H candle close → TP1/TP2 체크 스킵, 트레일링만 실행 확인
- [ ] 5M candle close → TP1/TP2 체크 실행, 트레일링 스킵 확인
- [ ] 1D candle close → TP1/TP2 + 트레일링 모두 스킵 확인
- [ ] TIME_EXIT (60h) 체크는 모든 TF에서 계속 실행 (SL도 모든 TF)
- [ ] openWatchSession 후 symbol_state.fsm_state = 'WATCHING' DB 확인
- [ ] invalidateWatchSession 후 symbol_state.fsm_state = 'IDLE' DB 확인
- [ ] HAS_POSITION 상태에서 invalidateWatchSession → fsm_state 변경 안 함 (active ticket 있으면)
- [ ] createTicket()은 기존대로 fsm_state='WATCHING' → 'HAS_POSITION' 전이

**Validation:**
```bash
bun test src/positions/ticket-manager.test.ts
bun test src/labeling/engine.test.ts
bun test src/signals/watching.test.ts
bun test src/daemon/pipeline.test.ts
bun test src/exits/checker.test.ts
bun run typecheck
```

## Task candidates

| ID | 제목 | 설명 | 마일스톤 |
|----|------|------|---------|
| T-18-001 | Safety Gate Rule 1: wick_ratio 비교 반전 수정 | `gt(wick,threshold)` → `lt(wick,threshold)`. 순추세 bypass 유지. 테스트 갱신. | M1 |
| T-18-002 | Safety Gate Rule 2: 박스권 중심 극성 반전 수정 | 중심 근접 시 차단, 중심 이탈 시 허용. 테스트 갱신. | M1 |
| T-18-003 | 일봉 방향 필터 slope=0 등호 허용 | `!slope.isZero()` 제거. slope≥0→LONG 가능, slope≤0→SHORT 가능. 테스트 갱신. | M1 |
| T-18-004 | 캔들 피처 분모 PRD 정렬 (body/upperWick/lowerWick/range) | 4개 분모를 O/H/H/L로 변경. zero-division 가드. 테스트 추가. | M2 |
| T-18-005 | Daily Loss Limit balance 인자 수정 | pipeline에서 실제 account balance 전달. checkAccountDailyLimit() 활성화. | M3 |
| T-18-006 | 손실 카운터 리셋 daemon 연결 | resetAllExpired()를 daemon 주기에 연결. LastResets 상태 관리. | M3 |
| T-18-007 | Vector 라벨링 closeTicket 단일 TX 연결 | closeTicket() 내에서 finalizeLabel() 호출. 단일 트랜잭션. | M4 |
| T-18-008 | TP/트레일링 타임프레임 가드 | TP1/TP2: 5M only. 트레일링: 1H only. TIME_EXIT/SL: 전 TF 유지. | M4 |
| T-18-009 | FSM 전이 DB 기록 (WATCHING ↔ IDLE) | openWatchSession → fsm='WATCHING'. invalidateWatchSession → fsm='IDLE'. | M4 |

## Risks

| 리스크 | 영향 | 완화 |
|--------|------|------|
| F-03~06 수정 후 기존 벡터 무효화 | KNN 결과 변경, 기존 학습 데이터 불일치 | 벡터 재구축 스크립트 필요 (별도 에픽). analysis 모드에서 먼저 검증 |
| F-01~02 Safety Gate 수정으로 신호 빈도 변경 | 진입 빈도/필터링 비율 변경 | 백테스트로 변경 전후 비교. PRD 기준이므로 수정 필수 |
| F-09 라벨링을 closeTicket TX에 합치면 lock 범위 확대 | TX 실패 시 ticket close까지 롤백 | finalizeLabel 실패 시 ticket close는 성공하되 라벨링만 재시도하는 fallback 고려 |
| F-08 리셋 타이밍이 캔들 처리와 경합 | 리셋 중 진입 판단 → 잘못된 카운터 | SymbolState FOR UPDATE 잠금 사용. 1H close 핸들러 내에서 리셋 실행 |

## Decision log

| 결정 | 근거 |
|------|------|
| PRD를 절대 기준으로 함 | 김직선 선생님 확정 사항. 코드 판단 철회 |
| TP1/TP2는 5M close에서만 | 선생님 원칙: 1M은 노이즈, 1H은 느림, 5M이 메인 TF |
| 트레일링은 1H close에서만 | 선생님 원칙: "바짝 따라붙지 마라, 큰 그림에서 봐라" |
| 벡터 재구축은 별도 에픽 | 이번 에픽은 코드 수정에 집중. 기존 벡터 invalidation은 후속 |
| TIME_EXIT(60h)와 SL 체크는 모든 TF 유지 | 안전장치는 가능한 한 자주 체크. PRD도 이를 제한하지 않음 |
| M4에서 FSM 전이 시 HAS_POSITION 상태 보호 | active ticket이 있으면 invalidateWatchSession이 IDLE로 바꾸면 안 됨 |

## Progress notes

- 2026-04-05: 에픽 생성. PRD v2.0 검증 보고서 기반.
- 2026-04-05: 태스크 9건 생성 완료.
- 2026-04-05: **전체 구현 완료 (9/9 태스크).**
  - Wave 1: T-18-001 ✅ + T-18-003 ✅
  - Wave 2: T-18-002 ✅ + T-18-004 ✅
  - Wave 3: T-18-005 ✅ + T-18-009 ✅
  - Wave 4: T-18-007 ✅ + T-18-008 ✅
  - Wave 5: T-18-006 ✅
  - typecheck: PASS, lint: PASS
  - T-18-001 → F-01 (Safety Gate wick)
  - T-18-002 → F-02 (Safety Gate box)
  - T-18-003 → F-10 (일봉 방향 등호)
  - T-18-004 → F-03~06 (캔들 피처 분모 4개)
  - T-18-005 → F-07 (Daily Loss Limit balance)
  - T-18-006 → F-08 (손실 카운터 리셋)
  - T-18-007 → F-09 (Vector 라벨링 단일 TX)
  - T-18-008 → F-11~12 (TP/트레일링 TF 가드)
  - T-18-009 → F-13~14 (FSM 전이 기록)
