# EP-18: PRD v2.0 P0 치명적 불일치 수정 — 완료 요약

**완료일**: 2026-04-05
**태스크**: 12/12 완료 (P0 9건 + 후속 조치 3건)
**웨이브**: 5 (병렬 2 WIP) + 후속 1 wave

## Key decisions
- PRD가 절대 기준 (김직선 선생님 확정)
- L5→L6 레이어 경계를 DI 패턴으로 해결 (LabelingDeps)
- invalidateWatchSession은 기존 시그니처 유지 (Option B: 세션 조회 후 symbol/exchange 획득)
- TP/trailing 타임프레임 가드는 checkExit에 optional timeframe 파라미터 추가 (백테스트 호환)
- 손실 카운터 리셋은 PipelineDeps 클로저로 daemon 상태 캡슐화

## Patterns discovered
1. **Filter polarity trap**: "PASS=차단" 의미 혼동으로 gt/lt 반전 버그 2건 발생
2. **Wiring gap**: 구현+테스트 완료된 함수의 호출처 0건 (resetAllExpired, finalizeLabel, checkAccountDailyLimit)
3. **Cross-task test interference**: 동일 파일 수정 시 기존 테스트 기대값 갱신 필요

## Outputs produced
- Safety Gate: wick_ratio `lt`, box range `inside_box_center`
- Candle features: body/O, upperWick/H, lowerWick/H, range/L
- Loss limit: 실제 balance 전달 + checkAccountDailyLimit 활성화 + counter reset wiring
- Vector labeling: closeTicket 단일 TX 내 classifyResult/classifyGrade
- TP=5M only, Trailing=1H only, TIME_EXIT=all TF
- FSM: openWatchSession→WATCHING, invalidateWatchSession→IDLE

## Test impact
- 2925 pass, 0 fail (EP-18 이전 대비 +659 tests)
- typecheck: PASS, lint: PASS
