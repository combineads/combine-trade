# Retrospective — 2026-04-04 (Daily Final)

**Window**: 2026-04-04 07:39 ~ 15:30 KST (full day, 4 sessions)
**Epics**: EP-04 Market Data → EP-05 Signal Pipeline → EP-06 Position Management → EP-07 Exits & Labeling
**Previous retro**: 없음 (하루 전체 회고는 첫 시행)

## Summary

| Metric | Value |
|--------|-------|
| Tasks completed | 41 |
| Commits | 40 |
| Source code (LOC, cumulative) | 12,431 |
| Test code (LOC, cumulative) | 27,660 |
| Test:Code ratio | 2.23:1 |
| Tests (total suite) | 1,617 pass, 0 fail |
| QA failures | 0 (4 epics 연속) |
| Review rejections | 0 (4 epics 연속) |
| Waves (total) | 20 |
| Quality score | 23/30 |
| Patterns discovered | 7 (3 기존 + 4 신규) |
| Archived tasks | 73 (EP-01~07) |
| Files changed | 255 |
| LOC added | +42,705 |

## What went well

1. **41 tasks, 0 QA failures**: 4개 에픽에서 41개 태스크 전체가 1차 통과. pre-implementation review가 Critical 이슈(파일 소유권 충돌 3회, 마이그레이션 번호 충돌 1회)를 사전 차단. 하루 전체에서 재작업 0건.

2. **Wave 효율 지속 개선**: EP-04(1.57 tasks/wave) → EP-05(2.50) → EP-06(2.25) → EP-07(2.00). 순수 함수 태스크를 Wave 1에 최대 배치하는 패턴이 정착. 20 Waves로 41 tasks 처리.

3. **전체 거래 파이프라인 완성**: Signal → Entry → Position → Exit → Labeling 라이프사이클이 코드로 존재. EP-08(대조)과 EP-09(데몬)을 추가하면 실제 운영 가능.

4. **코드 부채 0건 유지**: TODO/FIXME/HACK 마커 하루 종일 0건. 7개 에픽 연속.

5. **기존 실패 테스트 수정**: EP-04부터 지속된 `pool.test.ts` 병렬 초기화 실패를 종합 클린업에서 해결. 1,617 pass, **0 fail** 달성.

## What was hard

1. **executor.ts executeEntry() 219줄**: EP-06에서 파일 소유권 충돌 4건을 1건으로 병합한 대가. 7단계 로직이 한 함수에 집중. 아직 리팩토링 미수행.

2. **레이어 규칙 우회 복잡성**: 3가지 우회 패턴 발생 — (1) same-layer L1 schema 직접 접근, (2) DI 콜백 주입, (3) exits→orders 같은 L6 내 import. 각각 합리적이나 누적 시 아키텍처 복잡성 증가.

3. **E2E 테스트 시드 데이터 반복**: EP-05/06/07 E2E에서 동일 시드 패턴(Symbol, SymbolState, CommonCode, Signal, Vector, Ticket) 반복. 공통 헬퍼 미추출.

4. **ARCHITECTURE.md 모듈 맵 지연 갱신**: EP-06 클린업에서 positions/orders/limits 갱신, EP-07은 종합 클린업까지 미갱신. 코드와 문서 사이 시차 발생.

## Task breakdown by epic

### EP-04 Market Data (11 tasks, 7 waves, ~70min)
| Task | Title | Tests | Commit |
|------|-------|-------|--------|
| T-04-000 ~ T-04-010 | 캔들 수집 시스템 | 122 | 3805b18..b9ca470 |

### EP-05 Signal Pipeline (15 tasks, 6 waves, ~65min)
| Task | Title | Tests | Commit |
|------|-------|-------|--------|
| T-05-000 ~ T-05-014 | 방향→WATCHING→Evidence→Safety→Vector→KNN | 381 | d1e1b34..a173dac |

### EP-06 Position Management (9 tasks, 4 waves, ~58min)
| Task | Title | Tests | Commit |
|------|-------|-------|--------|
| T-06-001 | Ticket/Order 스키마 | 59 | 4e4a740 |
| T-06-002 | Ticket FSM | 40 | 4e4a740 |
| T-06-003 | 티켓 매니저 | 26 | f8c87e0 |
| T-06-004 | 포지션 사이저 | 30 | d356acd |
| T-06-005 | 주문 실행기 | 26 | c46f60e |
| T-06-006 | 슬리피지 체크 | 12 | d356acd |
| T-06-007 | 3단계 손실 제한 | 21 | 2928ad2 |
| T-06-008 | 손실 카운터 리셋 | 28 | f8c87e0 |
| T-06-009 | E2E 통합 테스트 | 7 | 737798e |

### EP-07 Exits & Labeling (6 tasks, 3 waves, ~45min)
| Task | Title | Tests | Commit |
|------|-------|-------|--------|
| T-07-001 | 청산 조건 검사 | 35 | 8301c09 |
| T-07-002 | 트레일링 스탑 | 26 | 8301c09 |
| T-07-003 | 청산 실행 매니저 | 21 | 2f8399d |
| T-07-004 | 피라미딩 | 15 | e7c8cb5 |
| T-07-005 | 라벨링 엔진 | 21 | e7c8cb5 |
| T-07-006 | E2E 통합 테스트 | 7 | e3fc84b |

## Harness efficiency

- **First-pass success rate**: 41/41 (100%) — 모든 태스크 QA 1차 통과
- **Review round-trip**: 0건 전체
- **Browser verification**: 해당 없음 (백엔드 태스크)
- **Opus escalation**: 0건
- **Pre-implementation review**: Critical 4건 사전 발견 (EP-05: 3, EP-06: 2, EP-07: 2)

> **관찰**: 7개 에픽 연속 QA 실패 0건, 리뷰 거부 0건. 태스크 명세의 Test Scenarios + pre-implementation review가 품질을 보장. QA 단계를 "검증 확인"으로 경량화 고려 가능. 다만 EP-08(대조 워커, 비동기)에서 복잡성이 증가할 수 있으므로 경량화는 EP-09 이후 판단.

## Patterns discovered (--compare with previous)

| Pattern | First seen | Recurring in | Status |
|---------|-----------|-------------|--------|
| pre-implementation-review | EP-04 | EP-05, 06, 07 | **정착** — 모든 에픽에서 Critical 사전 발견 |
| constructor-injection → 함수 인자 주입 | EP-04 | EP-05, 06 | 정착 |
| db-test-parallelism | EP-04 | — | 안정 |
| wave-parallelization | EP-05 | EP-06, 07 | **정착** — Wave 1 최대화 |
| pure-function-db-separation | EP-05 | EP-06(5/9), EP-07(4/6) | **정착** — 핵심 패턴 |
| same-layer-avoidance | EP-06 | — | 신규, EP-08에서 검증 예정 |
| di-callback-layer | EP-07 | — | 신규, backtest(EP-11)에서 재사용 예상 |

**Compared to EP-04 retro baseline**: 4개 패턴 추가 (wave-parallelization, pure-function-db-separation, same-layer-avoidance, di-callback-layer). 기존 3개 패턴 모두 유효 유지.

## Velocity trend (--compare)

| Metric | EP-04 | EP-05 | EP-06 | EP-07 | Trend |
|--------|-------|-------|-------|-------|-------|
| Tasks | 11 | 15 | 9 | 6 | ↓ (스코프 축소, 효율 증가) |
| Waves | 7 | 6 | 4 | 3 | ↑ 지속 개선 |
| Wall time | ~70m | ~65m | ~58m | ~45m | ↑ 지속 단축 |
| Tests/task | 11.1 | 25.4 | 27.7 | 20.8 | → 안정 (20~28) |
| Tasks/wave | 1.57 | 2.50 | 2.25 | 2.00 | → 안정 (2.0~2.5) |
| Test:Code ratio | 2.49 | 2.17 | 3.38 | 2.23 | → 안정 (2.2~3.4) |
| Quality score | 22 | 23 | 23 | 23 | → 안정 |

**종합 속도**: 41 tasks / ~4h = **10.25 tasks/hour**. EP별로는 EP-04(9.4/h) → EP-05(13.8/h) → EP-06(9.3/h) → EP-07(8.0/h). 복잡도가 높은 EP-06/07에서도 시간당 8~9개 태스크 처리.

## Cleanup findings resolved

종합 클린업에서 해결된 이슈 (이전 회고에서 미해결):

| Issue | Resolution |
|-------|-----------|
| pool.test.ts 병렬 실패 (EP-04~) | `closePool()` 선행 호출로 수정. **1,617 pass, 0 fail** |
| ARCHITECTURE.md 모듈 맵 stale | exits, labeling, positions 실제 API로 전면 갱신 |
| NodePgDatabase → DbInstance 불일치 | loss-limit.ts 6건 타입 통일 |
| closeSide() 중복 | core/types.ts로 추출, executor.ts + manager.ts에서 제거 |
| DI 콜백 패턴 미기록 | `docs/patterns/2026-04-04-di-callback-layer.md` 추가 |

## Recommendations

1. **EP-08 (Safety Net) 진행** — 대조 워커(reconciliation) + Slack 알림 + EventLog. 라이브 운영의 마지막 안전 레이어. QUALITY_SCORE Reliability 3→4 이상 가능. EP-08 마이그레이션 번호는 0006 (0005는 EP-06 Ticket/Order).

2. **E2E 테스트 헬퍼 추출** — `tests/helpers/seed-fixtures.ts`로 공통 시드 패턴 추출. EP-05/06/07 E2E에서 반복되는 makeTestSignal, makeMockAdapter, seedCommonCodes를 한 곳에 정의. EP-08 E2E에서 즉시 활용.

3. **executor.ts executeEntry() 리팩토링** — 219줄 → 3개 헬퍼(`attemptEntryOrder`, `registerSlOrClose`, `checkSlippageOrAbort`) 추출. EP-08 대조 모듈이 emergencyClose를 호출하므로, executor 구조가 깔끔해야 통합이 수월.

4. **QUALITY_SCORE Validation coverage 재평가** — 1,617 pass, 0 fail 달성. 기존 "1 fail" 상태에서 5점이었으므로, 0 fail 상태에서 5점 유지 확정. 다음 재평가는 EP-08 완료 후.
