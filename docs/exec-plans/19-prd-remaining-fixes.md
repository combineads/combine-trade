# EP-19: PRD v2.0 잔여 불일치 전체 수정

## Objective

PRD v2.0 검증 보고서의 P1/P2 잔여 항목 18건을 전부 수정하여 프로젝트 마무리.
EP-18에서 P0 9건 수정 완료. 이번 에픽에서 나머지 전부 처리.

## Scope

| 수정 ID | 항목 | 심각도 | 모듈 |
|---------|------|--------|------|
| #13 | WatchSession 스퀴즈 bandwidth 히스토리 | P1 | indicators, signals |
| #14 | WatchSession S/R 겹침 ≥2 레벨 카운트 | P1 | signals |
| #18 | ma20_slope 3봉 기울기 | P1 | indicators, vectors |
| #19 | rsi_extreme_count 14봉 히스토리 | P1 | indicators, vectors |
| #20 | WFO 통과/실패 게이트 | P1 | backtest |
| #21 | WFO 최적값 → CommonCode UPDATE | P1 | backtest, config |
| #26 | Slippage EventLog 기록 | P2 | orders |
| #27 | CommonCode 웹 수정 API | P2 | api, config |
| #28 | supports_one_step_order 플래그 사전 분기 | P2 | orders |
| #29 | supports_edit_order 플래그 사전 분기 | P2 | exits |
| #31 | 크래시 복구 fsm_state 명시적 복원 | P2 | daemon |
| #33 | Panic Close Slack @channel 긴급 표시 | P2 | reconciliation, notifications |
| #34 | SymbolState upsert 경로 | P2 | positions, db |
| #36 | BB width=0 → breakout_intensity 0.5 | P2 | vectors |
| #37 | KNN 방향 체크 순서 (KNN 전으로 이동) | P2 | daemon |
| #38 | 백테스트 CLI saveResult 연결 | P2 | backtest |
| #39 | WFO 튜닝 대상 화이트리스트 | P2 | backtest |
| #25 | Investing.com 경제지표 API | P2 | filters |

## Non-goals
- 벡터 재구축 (데이터 없음 — 미실행 애플리케이션)
- 웹 UI 신규 화면 추가

## Prerequisites
- EP-18 완료 ✅

## Milestones

### M1 — AllIndicators 확장 + 전략 피처 수정 (#18, #19, #36)
- AllIndicators에 sma20History (3봉), rsiHistory (14봉) 추가
- ma20_slope: 3봉 기울기로 변경
- rsi_extreme_count: 14봉 히스토리 카운트
- BB width=0 → breakout_intensity = 0.5

### M2 — WatchSession 조건 A/B (#13, #14)
- 스퀴즈 감지: bandwidth 히스토리 누적
- S/R 겹침: 독립 레벨 ≥2 카운트

### M3 — WFO/Backtest 완성 (#20, #21, #38, #39)
- WFO 통과/실패 게이트
- WFO 최적값 → CommonCode UPDATE
- 백테스트 CLI saveResult 연결
- WFO 튜닝 대상 화이트리스트

### M4 — Operational 수정 (#26, #28, #29, #31, #33, #34, #37)
- Slippage EventLog 기록
- Exchange adapter 플래그 사전 분기
- 크래시 복구 fsm_state 복원
- Panic Close Slack 긴급 표시
- SymbolState upsert
- KNN 방향 체크 순서

### M5 — CommonCode 웹 API + 경제지표 (#27, #25)
- CommonCode PUT/PATCH 엔드포인트
- Investing.com 경제지표 스크래퍼 + TradeBlock 생성

## Task candidates

| ID | 제목 | 마일스톤 |
|----|------|---------|
| T-19-001 | AllIndicators sma20/RSI 히스토리 확장 | M1 |
| T-19-002 | 전략 피처 3건 수정 (ma20_slope, rsi_extreme, BB width) | M1 |
| T-19-003 | WatchSession 스퀴즈 bandwidth 히스토리 | M2 |
| T-19-004 | WatchSession S/R 겹침 ≥2 레벨 카운트 | M2 |
| T-19-005 | WFO 통과/실패 게이트 + 최적값 CommonCode 반영 | M3 |
| T-19-006 | 백테스트 CLI saveResult + WFO 튜닝 화이트리스트 | M3 |
| T-19-007 | Operational 수정 일괄 (EventLog, BB, KNN순서, Slack, upsert) | M4 |
| T-19-008 | Exchange adapter 플래그 + 크래시 복구 fsm | M4 |
| T-19-009 | CommonCode 웹 수정 API | M5 |
| T-19-010 | Investing.com 경제지표 스크래퍼 | M5 |

## Risks

| 리스크 | 완화 |
|--------|------|
| AllIndicators 확장이 성능 영향 | 히스토리 크기 제한 (sma20: 3, rsi: 14) |
| Investing.com 스크래핑 불안정 | fail-closed 정책 (실패 시 거래 차단) |
| WFO CommonCode 자동 갱신이 위험할 수 있음 | dry-run 옵션 + Slack 알림 |

## Decision log

| 결정 | 근거 |
|------|------|
| #30 (Reconciliation FOR UPDATE) 제외 | 코드 검증: tickets 잠금이 아키텍처상 정확. 리뷰 오류 |
| #32 (WatchSession 재평가) 제외 | 다음 1H close에서 자연 발생. 명시적 스케줄링 불필요 |
| #40 (자동 이체) 제외 | EP-14에서 이미 구현 완료 확인 |

## Progress notes

- 2026-04-05: 에픽 생성. 잔여 18건 + 제외 3건.
