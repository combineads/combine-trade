# EP-19: PRD v2.0 잔여 불일치 전체 수정 — 완료 요약

**완료일**: 2026-04-05
**태스크**: 10/10 완료
**웨이브**: 5 (병렬 2 WIP)

## Key decisions
- AllIndicators 확장: sma20History(4), rsiHistory(14), bandwidthHistory(20) 추가
- S/R confluence: 독립 레벨 ≥2 카운트 방식 (MA20/60/120 + daily_open)
- WFO gate: OOS expectancy > 0 AND efficiency > 0.5 → CommonCode 자동 반영
- Economic calendar: Investing.com HTML 스크래핑 + fail-closed 정책
- L4→L7 레이어 위반: DI 패턴으로 해결 (sendSlackAlert 주입)

## Patterns discovered
1. AllIndicators 히스토리 확장 시 모든 테스트 mock에 새 필드 추가 필요 (17개 파일)
2. check-layers가 동적 import()도 감지 — DI/callback 패턴만 허용

## Outputs produced
- ma20_slope 3봉, rsi_extreme_count 14봉, BB width=0→0.5
- SQUEEZE_BREAKOUT 감지 경로 활성화
- S/R confluence ≥2 독립 레벨
- WFO pass/fail gate + CommonCode UPDATE
- 백테스트 saveResult + 튜닝 화이트리스트
- Slippage EventLog, @channel Slack, SymbolState upsert, KNN 순서 최적화
- Exchange adapter 플래그 사전 분기, 크래시 복구 fsm 복원
- CommonCode PUT API, 경제지표 스크래퍼

## Test impact
- 3,080 pass, 0 fail (EP-19 시작 대비 +152)
- typecheck: PASS, lint: PASS, check-layers: 0 violations
