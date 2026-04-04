# T-12-012 Pipeline — tp1/tp2 1H close 갱신 DB 반영

## Goal
process1H()에서 활성 WatchSession의 tp1/tp2를 현재 BB20 밴드 기준으로 재계산하고, watch_sessions 테이블에 DB 갱신한다.

## Why
EP-10 T-10-005에서 완료로 처리됐지만, `updateTpPrices()`는 순수 함수(직렬화만)로 실제 DB에 기록하지 않음. 1H close마다 BB20 밴드가 변하면 TP 목표가도 갱신되어야 하지만, 현재는 최초 detection 이후 고정.

## Inputs
- `src/daemon/pipeline.ts` — process1H() (라인 475-504), `deps.updateTpPrices()` 호출 (라인 500-503)
- `src/exits/manager.ts` — `updateTpPrices()` 순수 함수
- `src/signals/watching.ts` — TP 계산 로직 (detection type별)

## Dependencies
없음 (독립 태스크)

## Expected Outputs
- process1H()에서 1H close마다 TP 값을 재계산하고 DB에 UPDATE
- PipelineDeps에 DB 갱신 메서드 추가

## Deliverables
- `src/daemon/pipeline.ts` — process1H() 내 TP 갱신 + DB 반영 로직 추가

## Constraints
- TP 재계산 기준: detection_type에 따라 다름
  - SQUEEZE_BREAKOUT: tp1 = BB20 opposite band, tp2 = 기존 유지
  - SR_CONFLUENCE: tp1 = nearest S/R level, tp2 = next level
  - BB4_TOUCH: tp1 = SMA20, tp2 = BB20 opposite band
- 재계산 시 현재 1H indicators 사용 (이미 process1H에서 계산됨)
- DB UPDATE: `watch_sessions SET tp1_price=?, tp2_price=? WHERE id=?`
- PipelineDeps에 `updateWatchSessionTp(db, sessionId, tp1, tp2)` 추가

## Steps
1. PipelineDeps 타입에 `updateWatchSessionTp` 메서드 추가
2. process1H() 내 기존 `deps.updateTpPrices()` 호출 대체:
   - detection_type별 TP 재계산
   - `deps.updateWatchSessionTp(db, activeSession.id, newTp1, newTp2)` 호출
3. 기존 `updateTpPrices()` 호출 제거 또는 유지 (메모리 동기화 용도로 유지 가능)
4. 테스트 작성

## Acceptance Criteria
- 1H close 시 활성 WatchSession의 tp1/tp2가 현재 BB20 밴드 기준 재계산
- DB watch_sessions 테이블에 UPDATE 반영
- detection_type별 올바른 TP 계산
- indicators가 null (데이터 부족) → 기존 TP 유지
- **호출자 확인**: process1H() → updateWatchSessionTp() → DB 반영 경로 동작

## Test Scenarios
- process1H() SQUEEZE_BREAKOUT 세션 + BB20 변경 → tp1 재계산 → DB 갱신
- process1H() BB4_TOUCH 세션 + SMA20 변경 → tp1=SMA20 → DB 갱신
- process1H() indicators.bb20=null → 기존 TP 유지 (갱신 skip)
- process1H() 활성 세션 없음 → TP 갱신 없음
- updateWatchSessionTp() 호출 시 DB에 실제 UPDATE 실행

## Validation
```bash
bun test -- tests/daemon/pipeline
bun run typecheck && bun run lint
```

## Out of Scope
- WatchSession detection 로직 변경 (T-10-005 범위)
- exits/checker.ts 수정 → T-12-008
