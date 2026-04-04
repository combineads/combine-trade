# Weekly Harness Report — 2026-04-04 (Post EP-04)

## Summary
- Drift items found: 3
- Drift items fixed: 2 (QUALITY_SCORE.md 업데이트, exec-plan progress notes 추가)
- Stale tasks: 0
- Code debt markers: 0 (TODO: 0, FIXME: 0, HACK: 0)
- Doc duplications flagged: 2 (백오프 전략 cross-ref 부재, TIMEFRAME_DURATION_MS 코드 중복)
- Rules promoted: 2 (anti-patterns.md 추가 후보)
- AI slop detected: 1 (minor: TIMEFRAME_DURATION_MS 코드 중복)
- Epics archived: EP-03 (10 tasks), EP-04 (11 tasks)

## Pass 1: Documentation Drift

| File | Issue | Action |
|------|-------|--------|
| ARCHITECTURE.md | src/ 레이아웃에 candles/ 이미 명시됨. 실제 파일 9개 = 에픽 계획 일치 | 정상 |
| ARCHITECTURE.md | 13/21 모듈 구현 (core, db, config, indicators, exchanges, candles + 7개 placeholder). 계획대로 | 정상 |
| ARCHITECTURE.md | Module map: candles "CandleCollector, HistoryLoader, GapRecovery" = 코드 일치 | 정상 |
| DATA_MODEL.md | Candle 엔티티 정의 = db/schema.ts candleTable 일치 (FK, UNIQUE, CHECK 모두) | 정상 |
| AGENTS.md | `bun run build` — Vite 빌드 실패 (index.html 미존재). web UI 에픽 전까지 예상됨 | 기존 이슈 유지 |
| AGENTS.md | `bun run backtest` — 스크립트 미존재. EP-11 시 추가 예정 | 기존 이슈 유지 |
| QUALITY_SCORE.md | EP-03 기준 점수였음 → EP-04 반영 필요 | **수정 완료** |
| Layer violations | candles/ 임포트 전수 검사: @/core/* (L0), @/db/* (L1)만 임포트. L3→L0,L1 위반 0건 | 정상 |

### Layer dependency verification (candles/ = L3)
- **Allowed imports (L0-L2):** @/core/constants, @/core/logger, @/core/decimal, @/core/ports, @/core/types, @/db/pool, @/db/schema
- **Prohibited imports (L4+):** filters, knn, signals, positions, orders, exits, etc.
- **Result:** 0 violations across 9 source files

## Pass 2: Task Board

- Backlog: 0 tasks (에픽 간 자연 공백 — EP-05 태스크 생성 필요)
- Doing: 0 tasks (WIP 준수)
- Done: 0 tasks (모두 아카이빙 완료)
- Archive: 43 tasks total
  - EP-01: 14 tasks (기존)
  - EP-02: 8 tasks (기존)
  - EP-03: 10 tasks (**이번 정리에서 아카이빙**)
  - EP-04: 11 tasks (**이번 정리에서 아카이빙**)
- Stale: 없음
- .harness/state/: 디렉터리 미존재 (정상)
- Context size: done/ 비어 있음 (최적)

## Pass 3: Code Debt

| Type | Count | Files |
|------|-------|-------|
| TODO | 0 | -- |
| FIXME | 0 | -- |
| HACK | 0 | -- |
| TEMP | 0 | -- |

Clean codebase. No technical debt markers in src/ or tests/.

## Pass 4: Documentation Duplication

| Duplication | Location 1 | Location 2 | Severity |
|------------|-----------|-----------|----------|
| 백오프 전략 (exponential backoff 1s/2s/4s/max 30s) | ARCHITECTURE.md (rate limiting strategy) | RELIABILITY.md (WebSocket resilience) | Low — cross-ref 추가 권장 |
| Candle 보존 정책 (1D/1H/5M=3년, 1M=6개월) | exec-plans/04-market-data.md | src/candles/sync.ts RETENTION_MONTHS | Info — code is source of truth |

## Pass 5: Pattern Promotion

EP-04에서 발견된 패턴 2건 (anti-patterns.md 추가 후보):

### 1. DB 통합 테스트에서 mock 사용 금지
- Discovered: 2026-04-04, EP-04 (T-04-000)
- Problem: ON CONFLICT DO UPDATE WHERE, FK 제약, SQL 갭 감지 등 PostgreSQL 고유 동작은 mock으로 검증 불가
- Instead: Docker PostgreSQL + test-db 헬퍼로 실제 DB 통합 테스트. describe.skipIf(!isTestDbAvailable()) 패턴

### 2. 타임프레임 duration 상수를 여러 파일에 인라인하지 말 것
- Discovered: 2026-04-04, EP-04
- Problem: collector.ts (TIMEFRAME_DURATION_MS)와 gap-detection.ts (getTimeframeDurationMs)에 동일 상수가 중복 정의됨
- Instead: 단일 소스 (gap-detection.ts의 getTimeframeDurationMs)를 공유해야 함. collector.ts에서 임포트 가능

## Pass 6: Quality Score Update

| Category | EP-03 | EP-04 | Delta | Evidence |
|----------|------:|------:|------:|----------|
| Documentation truthfulness | 4 | 4 | 0 | ARCHITECTURE.md, DATA_MODEL.md 모두 코드와 일치 |
| Architecture clarity | 4 | 4 | 0 | L3 candles/ 레이어 위반 0건, check-layers.ts 작동 |
| Validation coverage | 4 | **5** | +1 | 865 tests (+122), DB 통합 테스트 인프라, 9개 candle 테스트 파일 (3435 LOC) |
| Reliability readiness | 2 | **3** | +1 | 갭 감지/복구, WS 재연결 감지, 에러 격리 패턴 |
| Security hygiene | 2 | 2 | 0 | .env.test 안전 (로컬 테스트 전용) |
| Developer experience | 4 | 4 | 0 | docker-compose 추가로 테스트 DB 원클릭 구동 |
| **Total** | **20** | **22** | **+2** | |

## Pass 7: AI Slop Detection (src/candles/)

### Dead code / unused exports
- **0 issues.** 모든 export가 index.ts barrel 또는 내부 모듈에서 사용됨

### Unnecessary abstractions
- **0 issues.** CandleManager가 유일한 클래스 계층 (CandleCollector, GapRecovery 직접 사용)

### Code duplication
- **1 issue (minor):** `TIMEFRAME_DURATION_MS` Record in collector.ts (lines 22-27) vs `getTimeframeDurationMs()` switch in gap-detection.ts (lines 17-28). 동일한 4개 타임프레임 duration 값이 두 곳에 정의됨. collector.ts에서 getTimeframeDurationMs()를 임포트하면 해결 가능
- **Severity:** Low. 값이 변경될 가능성 없음 (고정 타임프레임)

### Generic naming issues
- **0 issues.** 모든 함수/클래스명이 도메인 특화 (downloadCandles, bulkUpsertCandles, detectGaps 등)

### Functions > 50 lines
- **0 issues.** 가장 긴 함수: syncCandles (161 LOC total file, 함수 본체 ~45 LOC), handleCandle (~45 LOC). 모두 50 LOC 미만

### Overall assessment
candles/ 모듈은 깔끔하게 구현됨. 유일한 minor 이슈는 TIMEFRAME_DURATION_MS 중복이며, 이는 다음 에픽에서 리팩터링 가능.

## Recommendations
1. **EP-05 태스크 생성** — backlog 빈 상태, task-generator 실행 필요
2. **TIMEFRAME_DURATION_MS 중복 통합** — collector.ts에서 gap-detection.ts의 getTimeframeDurationMs() 임포트 (minor, 다음 에픽에서)
3. **ARCHITECTURE.md + RELIABILITY.md 백오프 cross-ref** — 기존 이슈 유지, 다음 정리 시 처리
4. **anti-patterns.md에 DB mock 금지 패턴 추가** — EP-04에서 발견된 핵심 패턴
