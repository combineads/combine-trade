# T-21-010 macro-collector process bootstrap + supervisor update

## Goal
`workers/macro-collector/src/db.ts` (CalendarEventRepository + NewsEventRepository Drizzle 구현)와 `workers/macro-collector/src/index.ts` (NEW: 스케줄 기반 polling — 60분 calendar, 30분 news)를 구현한다. `scripts/supervisor.ts`에 macro-collector를 추가한다.

## Why
macro-collector는 경제 캘린더와 뉴스를 수집해 LLM 의사결정 컨텍스트를 제공한다. 현재 `calendar-collector.ts`, `news-collector.ts`가 있지만 `index.ts`가 없다 (이벤트 기반이 아닌 스케줄 기반 워커라 처음부터 작성 필요).

## Inputs
- `workers/macro-collector/src/calendar-collector.ts` — CalendarCollector 구현
- `workers/macro-collector/src/news-collector.ts` — NewsCollector 구현
- `packages/shared/saveticker/` — SavetickerClient
- `db/index.ts` — Drizzle 싱글턴
- `scripts/supervisor.ts` — 기존 워커 수퍼바이저
- T-21-001 패턴 참조

## Dependencies
T-21-001

## Expected Outputs
- `workers/macro-collector/src/db.ts`
- `workers/macro-collector/src/index.ts` — 신규 (스케줄 polling)
- `scripts/supervisor.ts` — macro-collector 추가

## Deliverables
- `workers/macro-collector/src/db.ts`:
  - `CalendarEventRepository.upsertByExternalId(event)` → economic_events 테이블
  - `NewsEventRepository.upsert(event)` → news_events 테이블
- `workers/macro-collector/src/index.ts`:
  - env 검증 (`DATABASE_URL`, 선택적 `SAVETICKER_API_KEY`)
  - `SavetickerClient` 초기화
  - `setInterval(() => CalendarCollector.collect(), 60 * 60 * 1000)` — 60분마다
  - `setInterval(() => NewsCollector.collect(), 30 * 60 * 1000)` — 30분마다
  - 시작 시 즉시 1회 실행
  - SIGTERM → `clearInterval` + cleanup
- `scripts/supervisor.ts` — `WORKER_CONFIGS` 배열에 `macro-collector` 추가

## Constraints
- 이벤트 버스 구독 없음 (polling 기반 워커)
- `SAVETICKER_API_KEY` 없으면 경고 출력 후 계속 실행 (public API fallback 가능)
- upsert 멱등성 필수

## Steps
1. `macro-collector/src/` 기존 코드 읽기
2. `SavetickerClient` 인터페이스 확인
3. `db.ts` 구현
4. `index.ts` 구현 (setInterval 기반)
5. `scripts/supervisor.ts` 읽기 + macro-collector 추가
6. `bun run typecheck`

## Acceptance Criteria
- `"Macro collector started. Collection scheduled."` 출력
- 60분/30분 스케줄 설정 확인
- `scripts/supervisor.ts`에 macro-collector 포함
- `bun run typecheck` 통과
- SIGTERM 5초 이내 종료

## Validation
```bash
bun run typecheck
timeout 3 bun run workers/macro-collector/src/index.ts 2>&1 | head -5 || true
```

## Out of Scope
SavetickerClient 외 외부 API 통합, 수평 확장
