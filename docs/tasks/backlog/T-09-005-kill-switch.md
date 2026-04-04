# T-09-005 긴급 킬 스위치 — 독립 스크립트, emergencyClose 재사용

## Goal
긴급 상황 시 전 거래소의 모든 포지션을 청산하고 데몬을 analysis 모드로 전환하는 독립 스크립트 `scripts/kill-switch.ts`를 구현한다.

## Why
거래소 장애, 전략 오류, 또는 시스템 이상 시 데몬 프로세스 상태와 무관하게 즉시 모든 포지션을 청산할 수 있어야 함. 데몬이 죽어 있어도 CLI로 직접 실행 가능해야 함.

## Inputs
- `docs/exec-plans/09-daemon.md` — M4 마일스톤
- `src/orders/executor.ts` — emergencyClose() API
- `src/core/ports.ts` — ExchangeAdapter.fetchPositions(), cancelOrder()
- `src/notifications/slack.ts` — sendSlackAlert()
- `src/db/event-log.ts` — insertEvent()
- `src/db/schema.ts` — symbolStateTable (execution_mode 업데이트)

## Dependencies
- 없음 (독립 스크립트, daemon.ts와 무관)

## Expected Outputs
- `scripts/kill-switch.ts` — 기존 `export {};` 스텁을 완전한 킬 스위치로 교체
- `bun scripts/kill-switch.ts` 명령으로 실행 가능

## Deliverables
- `scripts/kill-switch.ts` — 긴급 킬 스위치 스크립트

## Constraints
- 데몬과 독립 실행 — 별도 DB 연결, 별도 exchange adapter 초기화
- 거래소별 순차 처리 (레이트리밋 방지)
- emergencyClose() 재사용 (EP-06 orders/executor.ts)
- 실패한 거래소도 건너뛰고 다음 거래소 계속 (최대한 많이 청산)
- 모든 SymbolState.execution_mode → 'analysis' 전환
- 모든 미체결 주문 취소
- 완료 후 Slack "KILL SWITCH ACTIVATED" 알림
- EventLog에 기록

## Steps
1. 테스트 파일 `tests/daemon/kill-switch.test.ts` 생성 — Test Scenarios 기반 TDD
2. `scripts/kill-switch.ts` 구현:
   - DB 연결 + config 로드
   - 거래소 adapter 초기화 (CommonCode EXCHANGE 그룹에서 활성 거래소 목록)
   - 전 거래소 fetchPositions()
   - 각 포지션 emergencyClose() (reduceOnly)
   - 모든 미체결 주문 cancelOrder()
   - SymbolState.execution_mode → 'analysis' (전체 UPDATE)
   - EventLog KILL_SWITCH 기록
   - Slack KILL SWITCH ACTIVATED 알림
   - DB 연결 종료 + exit
3. `bun run typecheck && bun run lint` 통과

## Acceptance Criteria
- `bun scripts/kill-switch.ts` 실행 시 전체 포지션 시장가 청산
- 모든 미체결 주문 취소
- SymbolState.execution_mode 전체 'analysis' 전환
- 거래소 A 실패 → 거래소 B 계속 처리
- Slack "KILL SWITCH ACTIVATED" 알림 발송
- EventLog에 KILL_SWITCH 이벤트 기록
- 정상 완료 시 exit code 0, 일부 실패 시 exit code 1 (로그에 실패 상세)

## Test Scenarios
- killSwitch() with 2 exchanges × 1 position each → 2번 emergencyClose() 호출, 모든 주문 취소
- killSwitch() with no open positions → 주문 취소 + 모드 전환만 수행
- killSwitch() with exchange API failure on exchange A → A 스킵, B 계속 청산
- killSwitch() with emergencyClose failure for one position → 에러 로그, 다음 포지션 계속
- killSwitch() → SymbolState.execution_mode 전체 'analysis' 업데이트 확인
- killSwitch() → Slack alert 발송 확인
- killSwitch() → EventLog KILL_SWITCH 이벤트 기록 확인

## Validation
```bash
bun test -- tests/daemon/kill-switch.test.ts
bun run typecheck
bun run lint
```

## Out of Scope
- 웹 UI 킬 스위치 버튼 (EP-11)
- API 엔드포인트 킬 스위치 (EP-11)
- 데몬 프로세스 종료 (킬 스위치는 포지션 청산 + 모드 전환만)
