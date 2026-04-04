# T-05-005 거래차단 관리자

## Goal
`src/filters/trade-block.ts`에 TradeBlock 테이블 기반 거래차단 판단 로직과 시드 데이터 삽입을 구현한다.

## Why
경제이벤트, 펀딩, 장 개장 시간에 거래를 차단하여 변동성 급증으로 인한 손실을 방지한다. 거래차단은 반복 패턴(매일 동일 시간)과 일회성 이벤트(경제지표 발표)를 모두 처리해야 한다.

## Inputs
- `docs/DATA_MODEL.md` — TradeBlock 엔티티 (block_type, is_recurring, recurrence_rule)
- `docs/PRODUCT.md` — 거래차단 규칙 (시장 개장, 펀딩, 경제이벤트, 수동)
- `src/db/schema.ts` — tradeBlockTable (T-05-001에서 생성)
- `src/core/types.ts` — TradeBlock, BlockType 타입

## Dependencies
- T-05-001 (TradeBlock 테이블)

## Expected Outputs
- `src/filters/trade-block.ts` exports:
  - `isTradeBlocked(db, now: Date) → Promise<{ blocked: boolean; reason?: string }>`
  - `seedTradeBlocks(db) → Promise<void>` — 고정 반복 패턴 시드 데이터 삽입
  - `addOneTimeBlock(db, block) → Promise<void>` — 일회성 거래차단 추가

## Deliverables
- `src/filters/trade-block.ts`

## Constraints
- 거래차단 판단 로직 (DATA_MODEL.md 기준):
  1. 반복 패턴(is_recurring=true): recurrence_rule 기반 시간 계산
  2. 일회성(is_recurring=false): start_time <= now <= end_time
  3. 두 조건 중 하나라도 true → 거래차단
- 시드 데이터: 아시아장/유럽장/미국장 오픈(S/W), 펀딩(0/8/16시) — 총 5개 고정 패턴
- fail-closed: DB 쿼리 실패 시 → 거래차단 상태 반환 (안전 우선)
- 반복 패턴의 시간 계산: UTC 기준, duration_min 으로 종료 시각 산출
- 펀딩 패턴: utc_hours 배열에서 각 시간 ± duration_min/2
- DB 통합 테스트: 실제 PostgreSQL에서 시드 삽입 + 차단 판정 검증

## Steps
1. DATA_MODEL.md, PRODUCT.md에서 거래차단 규칙 확인
2. src/filters/trade-block.ts 작성
   - isTradeBlocked: 반복 패턴 + 일회성 이벤트 모두 확인
   - seedTradeBlocks: 고정 패턴 5건 UPSERT
   - addOneTimeBlock: 일회성 거래차단 INSERT
3. 반복 패턴 시간 매칭 로직 구현 (UTC 기반)
4. fail-closed 에러 핸들링 추가
5. 단위 테스트 (시간 매칭 순수 함수)
6. DB 통합 테스트 (시드 삽입, 차단 판정)
7. filters/index.ts barrel export 업데이트
8. typecheck + lint 통과

## Acceptance Criteria
- isTradeBlocked()이 반복 패턴과 일회성 이벤트를 모두 정확히 판정
- seedTradeBlocks()이 5건의 고정 패턴을 DB에 삽입 (중복 실행 시 에러 없음 — UPSERT)
- addOneTimeBlock()이 일회성 거래차단을 정상 삽입
- DB 쿼리 실패 시 → { blocked: true, reason: 'DB error — fail-closed' }
- 펀딩 시간대(0시, 8시, 16시 ± 15분) 정확히 판정
- `bun run typecheck && bun run lint` 통과

## Test Scenarios
- isTradeBlocked() with 아시아장 오픈 시간(01:00 UTC) → blocked: true
- isTradeBlocked() with 아시아장 오픈 후(03:00 UTC) → blocked: false
- isTradeBlocked() with 펀딩 시간(23:50 UTC) → blocked: true
- isTradeBlocked() with 펀딩 후(00:20 UTC) → blocked: false
- isTradeBlocked() with 일회성 ECONOMIC 이벤트 시간대 → blocked: true
- isTradeBlocked() with DB 에러 발생 시 → blocked: true (fail-closed)
- seedTradeBlocks() 2회 실행 → 에러 없이 멱등 (5건 유지)
- [DB] 시드 삽입 후 TradeBlock 테이블에 5건 존재 확인
- [DB] isTradeBlocked() 실제 DB 조회로 시간 기반 차단 판정 정상

## Validation
```bash
bun test -- --grep "trade-block"
bun run typecheck
bun run lint
```

## Out of Scope
- Investing.com 경제이벤트 API 연동 (별도 태스크 또는 EP 이후)
- 방향 필터 (T-05-004)
- 웹 UI에서 수동 차단 관리 (EP-11)
