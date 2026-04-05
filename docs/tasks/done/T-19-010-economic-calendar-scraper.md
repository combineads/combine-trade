# T-19-010 Investing.com 경제지표 스크래퍼

## Metadata
- modules: [filters]
- primary: filters

## Goal
Investing.com 경제 캘린더에서 3스타 이상 이벤트를 스크래핑하여 `ECONOMIC` 타입 TradeBlock 레코드를 생성하는 `src/filters/economic-calendar.ts` 모듈을 구현한다. 매일 UTC 00:00에 실행하며, 스크래핑 실패 시 24시간 포괄 차단 + Slack 알림을 생성한다(fail-closed 정책).

## Why
PRD §7.3(L227)은 3스타 이상 경제 이벤트 120분 전후를 자동으로 거래 차단하도록 요구한다. 현재 해당 필터 구현이 없어 고변동성 이벤트(FOMC, CPI, GDP 등) 중 거래가 실행될 수 있다. ADR-004는 fail-closed 정책(스크래핑 실패 시 24시간 전체 차단)을 채택하여 부분 데이터보다 완전 차단을 우선한다.

## Inputs
- `src/filters/trade-block.ts` — `tradeBlockTable` INSERT 패턴
- `src/db/schema.ts` — `tradeBlockTable` 구조, `BlockType` 타입
- `src/notifications/slack.ts` — `sendSlackAlert()`
- PRD §7.3 L227: 3스타 이벤트 발생 120분 전 차단 시작, 이벤트 후 120분 해제
- ADR-004: 스크래핑 fail-closed 정책

## Dependencies
- 없음 (독립 신규 모듈)

## Expected Outputs
- 신규 `src/filters/economic-calendar.ts`
- 갱신된 `src/filters/index.ts` (export 추가)
- 신규 테스트 파일 `src/filters/economic-calendar.test.ts`

## Deliverables
- `src/filters/economic-calendar.ts`:
  - `EconomicEvent` 타입: `{ title: string; scheduledAt: Date; impactStars: number }`
  - `fetchEconomicCalendar(date: Date): Promise<EconomicEvent[]>` — Investing.com 스크래핑
    - 대상: 해당 날짜의 3스타(★★★) 이상 이벤트만 필터링
    - HTTP fetch + HTML 파싱 (htmlparser2 또는 정규식 기반)
  - `createEconomicTradeBlocks(db, events: EconomicEvent[]): Promise<void>` — 이벤트마다 TradeBlock INSERT
    - `block_type: "ECONOMIC"`, `blocked_at: scheduledAt - 120min`, `expires_at: scheduledAt + 120min`
    - `reason: event.title`
    - `symbol: "ALL"`, `exchange: "ALL"` (전체 심볼/거래소 대상)
  - `createFallbackTradeBlock(db): Promise<void>` — 스크래핑 실패 시 24시간 포괄 차단
    - `blocked_at: 오늘 UTC 00:00`, `expires_at: 내일 UTC 00:00`
    - `reason: "ECONOMIC_CALENDAR_FETCH_FAILED"`
  - `runDailyEconomicCalendar(db, deps): Promise<void>` — 오케스트레이터
    - `fetchEconomicCalendar()` 호출
    - 실패 시: `createFallbackTradeBlock()` + `sendSlackAlert("ECONOMIC_CALENDAR_FAILED", {...})`
    - 성공 시: `createEconomicTradeBlocks(db, events)`
  - 스케줄링: `scheduleDailyEconomicCalendar(db)` — `setInterval` 또는 cron-style 매일 UTC 00:00 실행
- `src/filters/index.ts`: `runDailyEconomicCalendar`, `scheduleDailyEconomicCalendar` export

## Constraints
- Investing.com fetch는 실제 HTTP 요청 — 테스트에서는 `fetch` 함수를 DI로 주입하여 mock
- fail-closed: `fetchEconomicCalendar()` throw 또는 파싱 오류 → 즉시 fallback
- `symbol: "ALL"`, `exchange: "ALL"` 특수 값으로 전체 적용 (DB 외래키 제약 없는 경우에 한함 — 스키마 확인 후 조정)
- Decimal.js 사용 없음 (날짜/시간 계산만)
- `bun run typecheck` 통과

## Steps
1. Write test code from ## Test Scenarios (RED phase)
2. Run tests — confirm all behavioral tests fail
3. `EconomicEvent` 타입 정의
4. `fetchEconomicCalendar(date, fetch?)` 구현:
   - Investing.com 경제 캘린더 URL 구성
   - HTML 응답 파싱 — 임팩트 별점 추출
   - 3스타 이상 필터링
5. `createEconomicTradeBlocks()` 구현 — Drizzle insert
6. `createFallbackTradeBlock()` 구현
7. `runDailyEconomicCalendar()` 오케스트레이터 구현
8. `scheduleDailyEconomicCalendar()` 구현 — UTC 00:00 다음 실행까지 대기 후 반복
9. `src/filters/index.ts` export 추가
10. Run tests — confirm all pass (GREEN phase)
11. Refactor while keeping tests green (REFACTOR phase)

## Acceptance Criteria
- [x] 3스타 이벤트 2건 파싱 성공 시 → TradeBlock 2행 INSERT (`block_type: "ECONOMIC"`)
- [x] 각 TradeBlock: `blocked_at = scheduledAt - 120분`, `expires_at = scheduledAt + 120분`
- [x] `fetchEconomicCalendar()` 네트워크 오류 → `createFallbackTradeBlock()` + Slack 알림
- [x] fallback TradeBlock: `blocked_at` = UTC 00:00, `expires_at` = 다음날 UTC 00:00
- [x] 1스타/2스타 이벤트 → TradeBlock 생성 없음 (필터링됨)
- [x] 이벤트 없는 날 → TradeBlock 없음 (정상)
- [x] Slack 알림은 fetch 실패 시에만 전송
- [x] `bun run typecheck` 통과

## Test Scenarios
- fetchEconomicCalendar() with mocked HTML containing 2x 3-star events → returns 2 EconomicEvent items
- fetchEconomicCalendar() with mocked HTML containing 1x 1-star and 1x 3-star → returns 1 item (3-star only)
- fetchEconomicCalendar() with fetch throwing network error → throws error (caller handles)
- createEconomicTradeBlocks() with 2 events → 2 DB INSERT calls with correct blocked_at/expires_at
- createEconomicTradeBlocks() event at 14:30 UTC → blocked_at=12:30 UTC, expires_at=16:30 UTC
- createFallbackTradeBlock() → INSERT with reason "ECONOMIC_CALENDAR_FETCH_FAILED", 24h window
- runDailyEconomicCalendar() with fetch failure → createFallbackTradeBlock called + sendSlackAlert called
- runDailyEconomicCalendar() with 3 events → createEconomicTradeBlocks called, no slack alert
- runDailyEconomicCalendar() with empty events array → no trade blocks, no slack alert

## Validation
```bash
bun test src/filters/economic-calendar.test.ts
bun run typecheck
```

## Out of Scope
- Investing.com 로그인/인증 (퍼블릭 캘린더 페이지 사용)
- 웹 UI에서 경제 이벤트 목록 표시
- 이미 생성된 TradeBlock 중복 방지 로직 (같은 날 두 번 실행 시 중복 가능 — 운영 스케줄러에서 관리)
- 스크래핑 대상 사이트 변경 (Investing.com 고정)
