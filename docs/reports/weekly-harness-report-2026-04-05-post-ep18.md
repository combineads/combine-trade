# Weekly Harness Report — 2026-04-05 (Post EP-18)

## Summary
- Drift items found: 3
- Drift items fixed: 1 (alignment review EP-18 banner)
- Stale tasks: 0
- Code debt markers: 0
- Doc duplications flagged: 1
- Rules promoted: 2
- Epic archived: EP-18 (9 tasks)

## Context: EP-18 Completed This Session
9 P0 PRD v2.0 critical fixes implemented in 5 waves (2 concurrent per wave):
- Safety Gate wick/box comparison inversions fixed
- Candle feature denominators aligned to PRD (O/H/H/L)
- Daily Loss Limit balance argument corrected + account-level check activated
- Loss counter reset wired to daemon
- Vector labeling connected to closeTicket in single transaction
- TP/trailing timeframe guards added (5M/1H)
- FSM WATCHING↔IDLE transitions now recorded in DB

## Pass 1: Documentation Drift

| File | Issue | Action |
|------|-------|--------|
| ARCHITECTURE.md | `src/kpi/` declared (L7) but directory missing | Not fixed — EP-16 placeholder |
| ARCHITECTURE.md | `filters/economic-calendar.ts` in integration table but absent | Not fixed — EP not yet planned |
| prd-v2-alignment-review.md | 9 P0 items shown as unresolved | Fixed — added EP-18 completion banner |

## Pass 2: Task Board

- Backlog: **0 tasks** (empty — needs task-generator for next epic)
- Doing: 0 tasks
- Done: 0 tasks (9 archived to EP-18)
- **EP-18 archived**: 9 tasks + SUMMARY.md → `docs/tasks/archive/ep-18-prd-critical-fixes/`

## Pass 3: Code Debt

| Type | Count | Files |
|------|-------|-------|
| TODO | 0 | — |
| FIXME | 0 | — |
| HACK | 0 | — |
| Dead code | 1 (low) | `calcMfeMae`/`calcCloseSize` exported but no production callers |

## Pass 4: Documentation Quality

- **Stale**: `prd-v2-alignment-review.md` P0 status → fixed with EP-18 banner
- **Ambiguous**: PRODUCT.md "box range center" phrasing → low priority
- **Overlap**: ARCHITECTURE.md / CODE_REGISTRY.md / MODULE_MAP.md triple overlap → accepted

## Pass 5: Promoted Rules

1. **Filter polarity trap** → `docs/anti-patterns.md`
2. **Wiring verification** → `docs/anti-patterns.md`

## Pass 6: Quality Scores

| Dimension | Previous | Current | Evidence |
|-----------|----------|---------|----------|
| Architecture clarity | 5 | 5 | Layer rules enforced, L5→L6 DI pattern |
| Validation coverage | 5 | 5 | 2,925 tests / 0 fail (+659 from EP-18) |
| Documentation truthfulness | 5 | 4 | Alignment review was stale (now patched) |
| Reliability readiness | 5 | 5 | Loss reset wired, FSM transitions recorded |
| Security hygiene | 3 | 3 | No changes |
| Developer experience | 5 | 5 | Test isolation exports clean |
| **Total** | **28/30** | **27/30** | |

## Pass 7: AI Slop Detection

| Category | Count | Files | Severity |
|----------|-------|-------|----------|
| Duplication | 1 | `safety-gate.ts` (isTrendFollowing 3-line x2) | Low |
| Long functions | 1 | `pipeline.ts` processEntry() 340+ lines | Low (pre-existing) |

## Top 3 Quality Risks

1. **Vector DB 무효화**: T-18-004 캔들 피처 분모 변경 → 기존 벡터와 신규 벡터 거리 비교 무의미. 벡터 재구축 에픽 필요
2. **EventLog 비규약 타입**: `PIPELINE_LATENCY`, `DAILY_BIAS_MISMATCH` 이벤트 타입이 `EVENT_TYPES` 상수에 없음
3. **Backlog 비어 있음**: 다음 에픽 계획 필요

## Recommendations

1. **벡터 재구축 에픽 생성** — 기존 벡터 무효. 재구축 스크립트 + 마이그레이션 필요
2. **P1 불일치 에픽 계획** — WatchSession 조건 A/B, ma20_slope 3봉, rsi_extreme_count 히스토리 등
3. **ARCHITECTURE.md 정리** — kpi/ placeholder 정리, economic-calendar 참조 제거
