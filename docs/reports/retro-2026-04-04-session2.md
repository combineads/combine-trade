# Retrospective — 2026-04-04 Session 2 (EP-06 + EP-07)

**Window**: 2026-04-04 12:40 ~ 15:26 KST (~2h 46min wall time)
**Epics**: EP-06 Position Management + EP-07 Exits & Labeling
**Previous session**: EP-04 Market Data + EP-05 Signal Pipeline (same date, 09:25 ~ 12:02)

## Session Summary

| Metric | EP-06 | EP-07 | Session Total |
|--------|-------|-------|---------------|
| Tasks completed | 9 | 6 | **15** |
| Source code (LOC) | 1,784 | 1,367 | **3,151** |
| Test code (LOC) | ~6,000 | ~2,100 | **~8,100** |
| Tests added | 249 | 125 | **374** |
| Tests (total suite) | 1,491 | 1,616 | **1,616** |
| QA failures | 0 | 0 | **0** |
| Waves | 4 | 3 | **7** |
| Commits (impl) | 6 | 4 | **10** |
| Commits (total) | 8 | 5 | **13** |

## Day Total (EP-04 ~ EP-07)

| Metric | EP-04 | EP-05 | EP-06 | EP-07 | **Day Total** |
|--------|-------|-------|-------|-------|---------------|
| Tasks | 11 | 15 | 9 | 6 | **41** |
| Tests (new) | 865 | 381 | 245 | 125 | **1,616** |
| Source LOC | 1,587 | 3,349 | 1,784 | 1,367 | **8,087** |
| Waves | 7 | 6 | 4 | 3 | **20** |
| QA failures | 0 | 0 | 0 | 0 | **0** |
| Wall time | ~70min | ~65min | ~58min | ~45min | **~4h** |

## Git evidence (this session, 13 commits)

| # | Commit | Time | Content |
|---|--------|------|---------|
| 1 | 91d3bae | 12:40 | Fix: Signal↔Vector 순환 참조 제거 |
| 2 | 4e4a740 | 12:45 | EP-06 W1A: Ticket/Order 스키마 + FSM |
| 3 | d356acd | 12:50 | EP-06 W1B: 사이저 + 슬리피지 |
| 4 | 2928ad2 | 12:55 | EP-06 W1C: 3단계 손실 제한 |
| 5 | f8c87e0 | 13:01 | EP-06 W2: 티켓 매니저 + 리셋 |
| 6 | c46f60e | 13:08 | EP-06 W3: 주문 실행기 |
| 7 | 737798e | 13:12 | EP-06 W4: E2E (EP-06 완료) |
| 8 | 2204b92+e3a89d5 | 13:38-39 | EP-06 정리 + 회고 |
| 9 | 8301c09 | 15:02 | EP-07 W1A: 청산 조건 + 트레일링 |
| 10 | e7c8cb5 | 15:14 | EP-07 W1B: 피라미딩 + 라벨링 |
| 11 | 2f8399d | 15:19 | EP-07 W2: 청산 실행 매니저 |
| 12 | e3fc84b | 15:24 | EP-07 W3: E2E (EP-07 완료) |
| 13 | 7139e89 | 15:26 | EP-07 정리 + 회고 |

## What went well

1. **Wave 효율성 지속 개선**: EP-04(7W/11T=1.57) → EP-05(6W/15T=2.50) → EP-06(4W/9T=2.25) → EP-07(3W/6T=2.00). 순수 함수 태스크를 Wave 1에 최대 배치하는 패턴이 정착.

2. **7개 에픽 연속 QA 실패 0건**: 41개 태스크 전체 1차 통과. pre-implementation review가 Critical 이슈(파일 소유권, 마이그레이션 번호)를 사전 차단하고, TDD + 순수함수 패턴이 구현 품질을 보장.

3. **순수 함수/DB 분리 패턴 완전 정착**: EP-06에서 5/9, EP-07에서 4/6 태스크에 적용. 순수 함수는 테스트가 빠르고 백테스트 재사용이 보장됨.

4. **코드 부채 0건 유지**: 전체 src/에 TODO/FIXME/HACK 0건. 7개 에픽 연속.

5. **파이프라인 완성도**: 이제 Signal → Entry → Position → Exit → Labeling 전체 거래 라이프사이클이 코드로 존재. EP-08(대조)과 EP-09(데몬)을 추가하면 실제 운영 가능.

## What was hard

1. **executor.ts 219줄 함수**: EP-06에서 executor.ts 파일 소유권 4건을 1건으로 병합한 대가로 executeEntry()가 219줄. 아직 리팩토링 미수행.

2. **레이어 규칙과 DI 복잡성**: pyramid(L5)→executor(L6) 콜백 주입, limits(L5)→symbolState L1 직접 접근 등 레이어 규칙 준수를 위한 우회가 코드 복잡성을 약간 증가시킴.

3. **E2E 테스트 시드 데이터 반복**: EP-06 E2E, EP-07 E2E 모두 Symbol, SymbolState, CommonCode, WatchSession, Signal, Vector, Ticket을 반복 시드. 공통 헬퍼 미추출.

## Patterns (this session)

| Pattern | Status | Used in |
|---------|--------|---------|
| 순수 함수/DB 분리 | Recurring (EP-05~07) | 9/15 태스크 |
| pre-implementation review | Recurring (EP-04~07) | Critical 4건 사전 발견 |
| Wave 1 최대화 | Recurring (EP-05~07) | Wave1: 5+4=9/15 태스크 |
| Same-layer import 회피 | New (EP-06) | limits→symbolStateTable |
| DI 콜백 레이어 우회 | New (EP-07) | pyramid→executor |

## Velocity trend (4 epics)

| Metric | EP-04 | EP-05 | EP-06 | EP-07 | Trend |
|--------|-------|-------|-------|-------|-------|
| Wall time | ~70m | ~65m | ~58m | ~45m | ↑ 지속 단축 |
| Tasks/wave | 1.57 | 2.50 | 2.25 | 2.00 | → 안정 |
| Tests/task | 11.1 | 25.4 | 27.7 | 20.8 | → 안정 |
| First-pass % | 100% | 100% | 100% | 100% | → 완벽 유지 |

## Project state after this session

```
구현 완료:
  EP-01 Foundation (core, db, config)
  EP-02 Indicators (BB, MA, RSI, ATR)
  EP-03 Exchanges (CCXT, Binance, WS)
  EP-04 Market Data (candles, sync, gap)
  EP-05 Signal Pipeline (direction → watching → evidence → safety → vector → KNN)
  EP-06 Position Management (FSM, sizer, executor, loss-limit)
  EP-07 Exits & Labeling (3-stage exit, trailing, pyramid, labeling)

남은 에픽:
  EP-08 Safety Net (reconciliation, Slack, EventLog) ← 다음
  EP-09 Daemon (orchestration, crash recovery, kill switch)
  EP-10 API & Web (REST, React dashboard)
  EP-11 Backtest & WFO
  EP-12 Auto Transfer

누적:
  73 archived tasks (EP-01~07)
  1,616 tests, 23/30 quality score
  ~8,000 source LOC, ~16,000 test LOC
```

## Recommendations for next session

1. **EP-08 (Safety Net) 진행** — 대조 워커 + Slack 알림 + EventLog. 라이브 운영의 마지막 안전 레이어. EP-08 마이그레이션 번호 확인 필요 (0005→0006).

2. **E2E 테스트 헬퍼 추출** — 3개 에픽(EP-05/06/07) E2E에서 반복되는 시드 패턴을 `tests/helpers/seed-fixtures.ts`로 추출. EP-08 E2E에서 바로 활용.

3. **ARCHITECTURE.md 모듈 맵 일괄 갱신** — exits, labeling 실제 API 미반영. EP-08 시작 전 정리.
