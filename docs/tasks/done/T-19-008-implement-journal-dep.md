# T-19-008 implement-journal-dep

## Goal
`journalDeps`를 위한 Drizzle query 함수(`listJournals`, `getJournal`, `searchJournals`, `getJournalAnalytics`)를 구현하고 `index.ts`에 wiring한다.

## Why
트레이딩 저널은 사용자가 거래 기록을 관리하는 핵심 기능이다. 현재 stub 상태여서 모든 저널 API가 500 또는 빈 응답을 반환한다.

## Inputs
- T-19-005 완료
- `apps/api/src/index.ts` — `journalDeps` stub 위치 + 인터페이스
- `db/schema/` — journals 테이블 스키마
- 저널 analytics 집계 로직 (있다면 기존 구현 확인)

## Dependencies
T-19-005

## Expected Outputs
- `apps/api/src/db/journals-queries.ts` — 4개 함수 구현
- `apps/api/src/index.ts` — `journalDeps` stub 교체

## Deliverables
- `apps/api/src/db/journals-queries.ts`
- `apps/api/src/index.ts` (수정)

## Constraints
- 모든 query는 `userId` 스코프 적용
- `searchJournals`: full-text search 또는 `ILIKE` 패턴 — DB 스키마에 따라 결정
- `getJournalAnalytics`: SQL 집계 쿼리 (`SUM`, `AVG`, `COUNT` 등) — JavaScript 계산 금지
- 통화 계산은 응답 레이어에서 Decimal.js 사용 (native float 금지)

## Steps
1. `journalDeps` 인터페이스 정의 확인
2. journals 테이블 스키마 확인
3. `journals-queries.ts` 작성:
   - `listJournals(userId, { limit, offset })` → 페이지네이션 지원
   - `getJournal(userId, journalId)` → 없으면 null
   - `searchJournals(userId, query)` → ILIKE 또는 FTS
   - `getJournalAnalytics(userId)` → SQL 집계
4. `index.ts` stub 교체
5. `bun run typecheck` 확인

## Acceptance Criteria
- `GET /api/v1/journals` → 200 (실제 데이터 또는 빈 배열)
- `GET /api/v1/journals/search?q=...` → 200
- `GET /api/v1/journals/analytics` → 200 (집계 데이터)
- `bun run typecheck` 통과

## Validation
```bash
bun run typecheck
bun test apps/api
```

## Out of Scope
- 저널 AI 분석
- 저널 공유/내보내기
- 저널 태그/카테고리 시스템 (스키마에 없다면)
