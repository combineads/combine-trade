# 12-strategy-verification-fix

## Objective
2026-04-04 전략 검증(PRD vs 코드, 155개 항목)에서 발견된 잔여 불일치(⚠️ 9건)와 미구현(❌ 17건) 중 EP-10에서 완료되지 않은 핵심 항목을 수정한다. 백테스트/WFO(EP-13) 이전에 전략 정합성을 100% 달성하는 것이 목표이다.

## Scope
- `src/signals/safety-gate.ts` — 역추세 조건 누락 수정, 금지3 avg_range_5 공식 교정
- `src/signals/evidence-gate.ts` — SL 버퍼 공식 교정 (ATR×0.5 → 꼬리길이×15%)
- `src/daemon/pipeline.ts` — 1H BB4 지표 주입 (A급 신호 활성화) + daily_bias 교차 검증 + tp1/tp2 1H 갱신
- `src/vectors/vectorizer.ts` — extractSession() → extractStrategy() 교체 (indices 190-201)
- `src/exits/checker.ts` — TP2 청산 비율 교정 (remaining/3 → remaining/2)
- `src/knn/decision.ts` — min_samples 기본값 교정 (20 → 30)
- `src/daemon/crash-recovery.ts` — WatchSession 명시적 복원
- `src/reconciliation/worker.ts` — getActiveTickets FOR UPDATE 실제 구현 확인/수정

## Non-goals
- 백테스트/WFO 실행 코드 (EP-13)
- 웹 UI / API 엔드포인트 (EP-11)
- 새로운 전략 피처 추가 (기존 PRD 명세 이행만)
- 캔들 피처 구조 변경 (카테고리형 분산 → 38봉×5 행렬 전환 불필요 — 개별 공식은 이미 정확)

## Prerequisites
- EP-01~EP-11 전체 완료 ✅
- EP-10 (strategy-alignment) 완료 — 이 에픽은 EP-10에서 미처리된 잔여 항목

## Background
EP-10 완료 후 전략 검증을 재실행한 결과, 155개 항목 중 129개 ✅(83%), 9개 ⚠️(6%), 17개 ❌(11%)로 집계되었다.

❌ 17건 중 12건은 전략 피처 벡터화(T-10-006 후속), 4건은 EP-13(백테스트/WFO) 범위, 1건은 1H BB4 A급 신호이다.
⚠️ 9건은 Safety Gate 역추세 조건(2), SL 공식(1), TP2 비율(1), min_samples(1), WatchSession 복구(1), 캔들 구조(1), WFO 파라미터(2)이다.

이 에픽에서 처리하는 항목 (라이브 매매에 직접 영향):
- ❌ 전략 피처 12개 벡터화 (12건)
- ❌ 1H BB4 A급 신호 (1건)
- ⚠️ Safety Gate 역추세 조건 (2건)
- ⚠️ SL 버퍼 공식 (1건)
- ⚠️ TP2 청산 비율 (1건)
- ⚠️ KNN min_samples (1건)
- ⚠️ WatchSession 크래시 복구 (1건)
- ❌ daily_bias 교차 검증 — EP-10 계획에 있었으나 코드 미구현 (1건)
- ❌ tp1/tp2 1H 갱신 DB 반영 — EP-10에서 완료로 처리됐으나 실제 DB 미기록 (1건)
- ⚠️ reconciliation FOR UPDATE — 인터페이스 계약만 존재, 실제 SQL 미확인 (1건)

EP-13(백테스트/WFO) 범위로 이관: ❌ 4건, ⚠️ 2건

## Milestones

### M1 — 신호 파이프라인 수정
Safety Gate, Evidence Gate, pipeline wiring의 PRD 불일치를 교정한다.

- Deliverables:
  - `src/signals/safety-gate.ts`:
    - 금지1 (wick ratio): direction 파라미터 추가, 역추세일 때만 차단 / 순추세는 bypass
    - 금지3 (큰 캔들): ATR14 → 최근 5봉 평균 range(`avg_range_5`) 교정 + 역추세 조건 추가
  - `src/signals/evidence-gate.ts`:
    - `calcSlPrice()` 교정: ATR×0.5 → 꼬리 바깥 + 꼬리길이×15% 버퍼
    - LONG: SL = low - (min(open,close) - low) × 0.15
    - SHORT: SL = high + (high - max(open,close)) × 0.15
  - `src/daemon/pipeline.ts`:
    - 5M/1M processEntry() 시 1H BB4 지표 계산 → `indicators.bb4_1h`에 주입
    - A급 신호(a_grade)가 실제 1H BB4 터치 반영
    - KNN PASS 후 결과 방향 ≠ daily_bias → SKIP (EP-10 Decision log에 명시됐으나 코드 누락)
    - process1H()에서 tp1/tp2 DB 갱신 로직 추가 (1H close마다 BB20 밴드 변화 반영)
- Acceptance criteria:
  - Safety Gate 금지1: 순추세 캔들은 wick ratio와 무관하게 통과
  - Safety Gate 금지3: avg_range_5 × 2.0 기준, 역추세만 차단
  - SL = 꼬리 바깥 + 꼬리길이 × 15% 버퍼
  - 1H BB4 터치 시 a_grade=true 설정
  - KNN PASS 후 daily_bias 불일치 시 SKIP + EventLog 기록
  - 1H close 시 활성 watch session의 tp1/tp2가 현재 BB20 밴드 기준으로 DB 갱신됨
  - **통합 테스트**: pipeline E2E 시나리오에서 bb4_1h 주입 → a_grade=true 경로 확인
  - **통합 테스트**: daily_bias=LONG_ONLY + KNN SHORT 결과 → SKIP 확인
- Validation:
  - `bun test -- tests/signals/ tests/daemon/`
  - `bun run typecheck && bun run lint`

### M2 — 전략 피처 벡터화
features.ts에 정의된 12개 전략 피처의 extraction 로직을 vectorizer.ts에 구현한다.
**중요**: 현재 vectorizer.ts의 `extractSession()` 함수가 indices 190-201에 session/timing 피처(hourSin, dowSin 등)를 채우고 있으나, features.ts는 동일 인덱스를 STRATEGY 피처로 정의. `extractSession()` → `extractStrategy()`로 **교체**한다.

- Deliverables:
  - `src/vectors/vectorizer.ts`:
    - 기존 `extractSession()` 함수 **삭제** (session/timing 피처 제거)
    - `extractStrategy()` 함수로 **교체** (전략 피처 12개 extraction):
      - bb20_position: (close-BB20_lower)/BB20_width, weight 1.0
      - bb4_position: (open-BB4_lower)/BB4_width, weight 2.0
      - ma_ordering: (MA20>MA60?1:0 + MA60>MA120?1:0)/2, weight 1.0
      - ma20_slope: (MA20[현재]-MA20[3봉전])/MA20[3봉전], weight 1.0
      - atr_separation: abs(close-MA20)/ATR14, weight 1.0
      - pivot_distance: (close-nearest high/low 20봉)/ATR14, weight 1.5
      - rsi_normalized: (RSI14-50)/50, weight 1.0
      - rsi_extreme_count: 20봉 중 RSI<30 or >70 수/20, weight 1.0
      - breakout_intensity: (close-highest(H,20))/close 또는 하방, weight 1.0
      - disparity_divergence: price_slope(10봉)-disp_slope(10봉), weight 1.0
      - daily_open_distance: (close-daily_open)/daily_open, weight 1.5
      - session_box_position: (close-session_low)/(session_high-session_low), weight 1.5
    - `vectorize()` 메인 함수에서 `extractSession()` 호출 → `extractStrategy()` 호출로 변경
  - indices 190-201이 features.ts 정의와 일치하는 전략 피처 값으로 채워짐
  - 정규화 파이프라인 통과 확인 (Median/IQR, lookback=60, clamp, [0,1])
- Acceptance criteria:
  - 202차원 벡터에서 indices 190-201이 유의미한 전략 피처 값 반환
  - features.ts FEATURE_NAMES[190..201]과 vectorizer.ts 출력 순서 일치
  - 각 피처의 가중치가 PRD 명세(FEATURE_WEIGHTS)와 일치
  - NaN/Infinity → 0.5, 분모 0 방어 처리
  - 미래 참조 없음 (현재 봉 + 과거 봉만 사용)
  - **호출자 확인**: `vectorize()` 내부에서 `extractStrategy()`가 실제 호출되고 결과가 최종 벡터에 포함됨
- Validation:
  - `bun test -- tests/vectors/`
  - `bun run typecheck && bun run lint`

### M3 — 포지션 관리 & 안전장치 교정

- Deliverables:
  - `src/exits/checker.ts`:
    - TP2_CLOSE_DIVISOR: 3 → 2 (잔여의 50% = 총량의 25% 청산)
  - `src/knn/decision.ts`:
    - DEFAULT_MIN_SAMPLES: 20 → 30
  - `src/daemon/crash-recovery.ts`:
    - recoverFromCrash()에 WatchSession 복원 로직 추가
    - CrashRecoveryDeps 인터페이스에 WatchSession 조회/무효화 메서드 추가
    - 활성 WatchSession 조회 → 유효성 검증 (daily_bias 일치, 24h 이내) → 무효 시 invalidate
  - `src/db/queries.ts` (또는 해당 DI 바인딩):
    - reconciliation `getActiveTickets` 쿼리에 실제 `SELECT ... FOR UPDATE` 포함 확인
    - 미포함 시 추가
- Acceptance criteria:
  - TP2 도달 시 잔여의 50% 청산, 나머지 50% 트레일링
  - KNN 최소 샘플 수 30개
  - 크래시 복구 시 WatchSession 상태가 명시적으로 검증됨
  - EventLog에 WatchSession 복원/무효화 기록
  - reconciliation getActiveTickets 쿼리가 FOR UPDATE를 사용함
- Validation:
  - `bun test -- tests/exits/ tests/knn/ tests/daemon/ tests/reconciliation/`
  - `bun run typecheck && bun run lint`

## Task candidates
- T-12-001: safety-gate.ts — 금지1 역추세 조건 추가 (direction 기반 bypass) [M1]
- T-12-002: safety-gate.ts — 금지3 avg_range_5 교정 + 역추세 조건 [M1]
- T-12-003: evidence-gate.ts — SL 버퍼 공식 교정 (꼬리길이×15%) [M1]
- T-12-004: pipeline.ts — 1H BB4 지표 주입 → A급 신호 활성화 + 통합 테스트 [M1]
- T-12-005: vectorizer.ts — extractSession()→extractStrategy() 교체 + 전략 피처 Part 1 (bb20/bb4/ma/ma20_slope) [M2]
- T-12-006: vectorizer.ts — 전략 피처 Part 2 (atr_separation/pivot/rsi_normalized/rsi_extreme_count) [M2]
- T-12-007: vectorizer.ts — 전략 피처 Part 3 (breakout/disparity/daily_open/session_box) + 호출자 연결 확인 [M2]
- T-12-008: checker.ts — TP2 청산 비율 교정 (DIVISOR 3→2) [M3]
- T-12-009: decision.ts — min_samples 기본값 30으로 변경 [M3]
- T-12-010: crash-recovery.ts — WatchSession 명시적 복원 + EventLog [M3]
- T-12-011: pipeline.ts — KNN PASS 후 daily_bias 교차 검증 (방향 불일치 시 SKIP) [M1]
- T-12-012: pipeline.ts + watching.ts — tp1/tp2 1H close 갱신 DB 반영 [M1]
- T-12-013: reconciliation — getActiveTickets FOR UPDATE 실제 구현 확인/수정 [M3]
- T-12-014: 전략 검증 체크리스트 문서 생성 + E2E 재검증 (155개 항목) [E2E]

## Risks
- **벡터 하위 호환성**: session→strategy 피처 교체로 기존 벡터 무효화. **완화**: EP-10에서 이미 TRUNCATE 결정. 운영 전이므로 영향 없음.
- **SL 공식 변경 영향**: ATR 기반 → 꼬리 기반으로 SL 폭 변화. **완화**: analysis 모드에서 관찰 후 live 전환.
- **Safety Gate 완화 영향**: 순추세 bypass로 진입 빈도 증가 가능. **완화**: 이미 KNN에서 2차 필터링.
- **TP2 비율 변경**: 잔여/3 → 잔여/2로 더 많이 청산. **완화**: 트레일링 잔량 감소하지만 수익 확정 증가.
- **1H BB4 계산 오버헤드**: 5M/1M 진입마다 1H 지표 계산 추가. **완화**: 1H 캔들은 이미 캐싱되어 있으므로 I/O 증가 미미.
- **Wiring 누락 반복**: EP-10에서 인터페이스만 구현하고 연결(wiring)을 빠트린 사례 3건 발견. **완화**: 모든 태스크 AC에 "호출자 확인" + 통합 테스트 필수화.

## Decision log
- EP-10 잔여 항목을 별도 에픽으로 분리 — EP-10은 이미 완료(아카이빙됨) 상태이므로 재오픈하지 않음
- 전략 피처 벡터화는 3개 태스크로 분할 (4+4+4) — 단일 태스크로 12개 피처 구현은 범위 초과
- 캔들 피처 구조(38봉×5 vs 카테고리 분산)는 변경하지 않음 — 개별 공식이 정확하므로 구조 변경은 불필요한 리스크
- TP2 비율은 PRD 명세(잔여의 50% = 총량 25%)를 따름 — "잔여의 절반"이 명시적
- **indices 190-201 교체 결정**: features.ts(specification)가 STRATEGY를 정의하므로 vectorizer.ts의 extractSession()(session/timing 피처)을 extractStrategy()로 교체. session/timing 피처는 EP-10 이전부터 KNN 성능에 기여도가 낮다고 판단. 벡터 TRUNCATE 예정이므로 하위 호환 문제 없음
- **daily_bias 교차 검증 추가**: EP-10 Decision log에 "pipeline.ts(L9)에서 수행"으로 명시했으나 실제 코드가 없었음 — 이번에 반드시 구현. KNN PASS 후 방향 불일치 시 SKIP
- **tp1/tp2 1H 갱신 추가**: EP-10 T-10-005에서 완료로 처리됐으나, updateTpPrices()가 순수 함수로 DB에 반영하지 않음 — watch_sessions 테이블의 tp1_price/tp2_price를 1H close마다 갱신
- **EP-10 누락 근본 원인**: 인터페이스(함수 정의, 체크 코드)만 작성하고 연결(pipeline 주입, DB 반영)을 빠트림. 방지책으로 모든 태스크 AC에 "호출자/wiring 확인" 항목과 통합 테스트를 필수화

## Consensus Log
- (계획 단계 — 전략 검증 결과 기반 후속 에픽)

## Progress notes
- 2026-04-04: 전략 검증 155개 항목 실행 → 129✅ / 9⚠️ / 17❌ 확인
- 2026-04-04: EP-12 신규 생성, 기존 EP-12(backtest-wfo)→EP-13, EP-13(auto-transfer)→EP-14로 번호 이동
- 2026-04-04: EP-12 리뷰 완료. 변경 사항:
  - **+3 태스크** 추가: T-12-011(daily_bias 교차검증), T-12-012(tp1/tp2 DB 갱신), T-12-013(FOR UPDATE 구현)
  - **T-12-011(E2E) → T-12-014로 재번호**: 전략 검증 체크리스트 문서 생성을 선행 작업으로 포함
  - **M2 수정**: extractSession()→extractStrategy() 교체 명시 (indices 190-201 충돌 해소)
  - **M1 수정**: daily_bias 교차검증 + tp1/tp2 1H 갱신 deliverables/AC 추가
  - **M3 수정**: FOR UPDATE 실제 구현 확인 deliverable 추가
  - **Decision log +4건**: indices 교체, daily_bias 누락 원인, tp1/tp2 누락 원인, 근본 원인 분석
  - **Risks +1건**: wiring 누락 반복 방지
  - 총 태스크: 11 → 14, 총 처리 항목: 19+3=22 (EP-10 누락 3건 포함)
- 2026-04-04: 태스크 생성 완료 (14개). 의존성 분석:
  - Wave 1 (독립, 11개): T-12-001~004, T-12-005, T-12-008~013
  - Wave 2 (T-12-005 의존, 2개): T-12-006, T-12-007
  - Wave 3 (전체 의존, 1개): T-12-014 (E2E)
  - WIP=2 기준: Wave 1 → 6 사이클, Wave 2 → 1 사이클, Wave 3 → 1 사이클 = 총 8 사이클
- 2026-04-05: **EP-12 구현 완료**. 14/14 태스크 전부 done.
  - 테스트: 2266 pass / 0 fail (+103 신규 테스트, 기존 실패 6건 전부 수정)
  - typecheck: clean, lint: clean
  - 주요 성과:
    - M1: safety-gate 역추세 bypass, SL 꼬리×15%, bb4_1h 주입, daily_bias 교차검증, tp1/tp2 DB 갱신
    - M2: extractSession()→extractStrategy() 전환, 12개 전략 피처 완전 구현 (indices 190-201)
    - M3: TP2 divisor 3→2, min_samples 20→30, WatchSession 복원, FOR UPDATE 구현
    - E2E: 6개 실패 테스트 수정, TicketSnapshot 타입 L0 이동으로 레이어 위반 해소
  - EP-10 누락 3건 모두 해결: daily_bias 교차검증, tp1/tp2 DB 갱신, FOR UPDATE 실제 구현
