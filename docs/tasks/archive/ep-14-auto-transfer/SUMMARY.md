# EP-14 Auto Transfer — Archive Summary

## Completed
2026-04-05

## Tasks: 9/9
- T-14-001: TRANSFER CommonCode 시드 추가
- T-14-002: 이체 가능 잔고 계산 (balance.ts)
- T-14-003: 이체 실행기 + ExchangeAdapter.transfer() 포트
- T-14-004: 이체 스케줄러 (scheduler.ts)
- T-14-005: 수동 즉시 이체 CLI (transfer-now.ts)
- T-14-006: Slack 이체 알림 템플릿
- T-14-007: 이체 API 엔드포인트
- T-14-008: 웹 대시보드 이체 이력 UI
- T-14-009: 이체 E2E 통합 테스트

## Key decisions
- Transfer 테이블 폐기 → EventLog 통합 (TRANSFER_SUCCESS/FAILED/SKIP)
- 동적 reserve = balance x risk_pct x reserve_multiplier (최소 50 USDT)
- L7→L7 의존 방지: transfer는 결과만 반환, daemon이 Slack 호출
- setTimeout 체인 (setInterval 미사용 — 드리프트 방지)
- 이체 금액 항상 floor (반올림 금지)

## Patterns discovered
- DI 패턴 (TransferExecutorDeps, TransferSchedulerDeps) — 테스트 용이
- 순수 함수 분리 (calculateTransferable, parseArgs, getNextRunTime) — 단위 테스트 가능
- ExchangeAdapter 포트 확장 패턴 (transfer() 추가 시 모든 mock 업데이트 필요)

## Outputs produced
- `src/transfer/` (balance.ts, executor.ts, scheduler.ts, index.ts)
- `src/api/routes/transfers.ts`
- `src/web/src/components/dashboard/TransferHistory.tsx`
- `src/web/src/hooks/useTransfers.ts`
- `scripts/transfer-now.ts`
- ~129 tests added
