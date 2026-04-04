# T-10-012 주문 전 bid/ask spread 사전 체크

## Goal
주문 실행 전에 bid/ask 스프레드를 검증하여, 스프레드가 임계값(max_spread_pct)을 초과하면 ABORT하고 EventLog에 SLIPPAGE_ABORT를 기록한다. 기존 checkSlippage()는 주문 **후** 체결가 vs 기대가 검증이므로, 이 태스크는 주문 **전** 시장 상태 검증이다.

## Why
유동성이 부족한 시점에 주문을 넣으면 의도한 가격에서 크게 벗어난 체결이 발생할 수 있다. 주문 전에 bid/ask 스프레드를 확인하여 비정상적으로 넓은 스프레드 상황을 사전 차단하면, 불리한 체결로 인한 손실을 예방할 수 있다. 기존 post-fill checkSlippage()와는 체크 시점이 다른 별도 안전장치이다.

## Inputs
- `docs/exec-plans/10-strategy-alignment.md` — M3 spread 사전 체크 요구사항
- `src/orders/executor.ts` — executeEntry() 현재 구현 (spread 사전 체크 위치: mode guard 후, leverage 설정 전)
- `src/orders/slippage.ts` — 기존 checkSlippage() (post-fill, 참고용)
- `src/core/ports.ts` — ExchangeAdapter 인터페이스

## Dependencies
- 없음 (독립 태스크)

## Expected Outputs
- `src/orders/executor.ts` — checkSpreadPreEntry() 함수 추가, executeEntry()에서 주문 전 호출
- `src/orders/slippage.ts` 또는 별도 파일 — SpreadCheckConfig 타입, checkSpread() 순수 함수
- `tests/orders/spread-precheck.test.ts` — spread 사전 체크 테스트

## Deliverables
- `src/orders/executor.ts`
- `src/orders/slippage.ts` (SpreadCheckConfig, checkSpread 추가)
- `tests/orders/spread-precheck.test.ts`

## Constraints
- 기존 checkSlippage() (post-fill)는 수정하지 않음 — 별개 체크
- spread 계산식: `spread = (ask - bid) / mid`, `mid = (ask + bid) / 2`
- spread > max_spread_pct → ABORT, EventLog에 SLIPPAGE_ABORT 기록
- Decimal.js로 모든 계산 수행 (float 금지)
- ExchangeAdapter에 fetchTicker가 없을 경우, executeEntry 파라미터로 bid/ask를 전달받거나 SpreadCheckParams로 주입. 어댑터 인터페이스 변경은 최소화
- spread 설정이 없거나 0인 경우 체크 건너뜀 (기본값: skip)
- executeEntry의 ExecuteEntryParams에 spreadConfig 선택 필드 추가

## Steps
1. `src/orders/slippage.ts`에 SpreadCheckConfig 타입 추가: `{ maxSpreadPct: Decimal; bid: Decimal; ask: Decimal }`
2. `src/orders/slippage.ts`에 checkSpread(bid, ask, maxSpreadPct) 순수 함수 추가: spread 계산 + 통과/실패 결과 반환
3. `src/orders/executor.ts`의 ExecuteEntryParams에 `spreadCheck?: { bid: Decimal; ask: Decimal }` 선택 필드 추가
4. executeEntry() 내 mode guard 통과 후, leverage 설정 전에 spread 사전 체크 로직 삽입
5. spread 초과 시 ABORT 반환: `{ success: false, aborted: true, abortReason: "spread exceeded ..." }`
6. spread 초과 시 EventLog SLIPPAGE_ABORT 기록 (deps.insertEvent 또는 로그 + 반환값에 포함)
7. spreadCheck 미제공 또는 maxSpreadPct 미설정 시 체크 건너뜀
8. 테스트 파일 작성
9. typecheck + lint 통과 확인

## Acceptance Criteria
- spread가 임계값 이내인 경우 주문 정상 진행
- spread가 임계값 초과인 경우 주문 ABORT + abortReason에 spread 정보 포함
- ABORT 시 SLIPPAGE_ABORT 이벤트 로그 기록 (또는 반환값으로 전달)
- spreadCheck 파라미터 미제공 시 체크 건너뛰고 정상 진행
- 기존 checkSlippage() (post-fill) 테스트 전부 통과 (회귀 없음)
- Decimal.js 정밀도 유지

## Test Scenarios
- bid=100, ask=100.05, maxSpreadPct=0.1% → spread=0.05% → 통과, 주문 진행
- bid=100, ask=101, maxSpreadPct=0.1% → spread≈0.995% → ABORT + SLIPPAGE_ABORT
- spreadCheck 미제공 (undefined) → 체크 건너뜀, 주문 정상 진행
- bid=100, ask=100 (spread=0) → 통과
- bid=99, ask=101, maxSpreadPct=2.0% → spread≈2.0% → 경계값 (>= → ABORT)
- maxSpreadPct=0 → 모든 non-zero spread에서 ABORT (엄격 모드)

## Validation
```bash
bun test -- --grep "spread"
bun test -- --grep "slippage"
bun run typecheck
bun run lint
```

## Out of Scope
- ExchangeAdapter.fetchTicker() 구현 (별도 태스크)
- 기존 checkSlippage() (post-fill) 수정
- pipeline.ts에서 bid/ask를 가져오는 로직 (호출부 연결은 E2E에서 검증)
- 다른 M3 안전장치 (FSM 가드, 계좌 일일 손실 등)
