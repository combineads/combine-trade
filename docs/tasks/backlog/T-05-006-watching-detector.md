# T-05-006 WATCHING 감지기 + WatchSession DB 생명주기

## Goal
`src/signals/watching.ts`에 1H 캔들 마감 시 WATCHING 조건을 감지하고, WatchSession DB 레코드의 생성/무효화 생명주기를 관리하는 로직을 구현한다.

## Why
WATCHING은 진입 기회 탐색의 트리거. 3가지 감지 유형(Squeeze Breakout, S/R Confluence, BB4 Touch) 중 하나가 발생하면 WatchSession이 시작되고, 전제 조건이 무너지면 즉시 무효화된다. Evidence Gate(T-05-007)는 활성 WatchSession이 있을 때만 시그널을 생성한다.

## Inputs
- `docs/PRODUCT.md` — WATCHING 감지 규칙 (스퀴즈 브레이크아웃, S/R 컨플루언스, BB4 터치)
- `docs/DATA_MODEL.md` — WatchSession 엔티티 (detection_type, direction, context_data)
- `src/db/schema.ts` — watchSessionTable (T-05-001에서 생성)
- `src/core/types.ts` — WatchSession, DetectionType, Direction, DailyBias
- `src/indicators/` — calcBB20, calcBB4, calcSMA, detectSqueeze

## Dependencies
- T-05-001 (WatchSession 테이블)

## Expected Outputs
- `src/signals/watching.ts` exports:
  - `detectWatching(candle, indicators, dailyBias) → WatchingResult | null`
  - `openWatchSession(db, params) → WatchSession`
  - `invalidateWatchSession(db, sessionId, reason) → void`
  - `getActiveWatchSession(db, symbol, exchange) → WatchSession | null`
  - `checkInvalidation(candle, indicators, session) → string | null` (무효화 사유)
- `src/signals/index.ts` — barrel export

## Deliverables
- `src/signals/watching.ts`

## Constraints
- 3가지 감지 유형 (모두 1H 마감 시 평가):
  1. **Squeeze Breakout**: squeeze 상태에서 expansion으로 전환 + 가격이 BB20 밴드 밖
  2. **S/R Confluence**: 최근 N개 피봇 포인트에서 2개 이상 레벨이 BB4 근처에 밀집
  3. **BB4 Touch**: 1H close가 BB4 upper/lower를 터치 또는 돌파
- 방향 결정: daily_bias와 일치하는 방향만 감지 (LONG_ONLY에서는 LONG만)
- NEUTRAL bias: LONG/SHORT 모두 감지 가능
- 심볼×거래소당 활성 WatchSession 최대 1개
  - 새 세션 시작 시 기존 활성 세션 자동 무효화 (reason: 'new_session_started')
- 무효화 조건: daily_bias 변경, 가격이 반대 BB20 밴드 돌파, 시간 경과(다음 1D 마감)
- context_data에 감지 시점 BB값, S/R 레벨, squeeze 상태 스냅샷 저장
- WatchSession.tp1_price = 1H MA20, tp2_price = 1H 반대편 BB20 (감지 시점 값)
- Decimal.js로 모든 가격 비교
- DB 통합 테스트: 실제 PostgreSQL에서 WatchSession CRUD 검증

## Steps
1. PRODUCT.md에서 3가지 WATCHING 규칙 상세 확인
2. 각 감지 유형의 순수 판정 함수 작성 (detectSqueezeBreakout, detectSRConfluence, detectBB4Touch)
3. detectWatching 통합 함수 작성 (3가지 유형 순차 평가, 첫 번째 매칭 반환)
4. openWatchSession DB 생성 로직 (기존 활성 세션 자동 무효화 포함)
5. invalidateWatchSession DB 업데이트 로직
6. getActiveWatchSession 조회 로직
7. checkInvalidation 무효화 조건 판정 함수
8. signals/index.ts barrel export 생성
9. 단위 테스트 (순수 판정 함수)
10. DB 통합 테스트 (WatchSession CRUD, 활성 세션 제약)

## Acceptance Criteria
- Squeeze Breakout: squeeze→expansion 전환 + 방향 일치 시 감지
- S/R Confluence: 피봇 레벨 밀집 감지
- BB4 Touch: 1H close가 BB4 터치 시 감지
- daily_bias와 불일치하는 방향은 무시
- 심볼×거래소당 활성 세션 1개 제약 준수
- 무효화 조건 정확 (bias 변경, 가격 이탈)
- context_data에 스냅샷 저장
- DB 통합 테스트 통과

## Test Scenarios
- detectWatching() with squeeze→expansion + bias=LONG_ONLY + price > BB20 upper → SQUEEZE_BREAKOUT, LONG
- detectWatching() with squeeze→expansion + bias=SHORT_ONLY + price > BB20 upper → null (방향 불일치)
- detectWatching() with BB4 lower touch + bias=LONG_ONLY → BB4_TOUCH, LONG
- detectWatching() with no conditions met → null
- detectWatching() with bias=NEUTRAL + squeeze breakout → 감지됨 (NEUTRAL은 양방향 허용)
- checkInvalidation() with bias changed → 'bias_changed'
- checkInvalidation() with price beyond opposite BB20 → 'price_breakout'
- checkInvalidation() with conditions still valid → null
- [DB] openWatchSession() → WatchSession 레코드 생성됨
- [DB] openWatchSession() with existing active session → 기존 세션 무효화 후 새 세션 생성
- [DB] getActiveWatchSession() → invalidated_at IS NULL인 세션 반환
- [DB] invalidateWatchSession() → invalidated_at과 reason 업데이트됨

## Validation
```bash
bun test -- --grep "watching"
bun run typecheck
bun run lint
```

## Out of Scope
- Evidence Gate (T-05-007)
- Safety Gate (T-05-008)
- 데몬 오케스트레이션 (EP-09)
