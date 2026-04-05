# 일상 운영

## 2.1 데몬 시작

```bash
# 프로덕션 모드
bun run daemon

# 개발 모드 (파일 변경 시 자동 재시작)
bun run dev
```

### 데몬 시작 순서

1. DB 연결 수립
2. CommonCode 설정 로드 (메모리 캐시)
3. 크래시 복구 (이전 비정상 종료 시 포지션/티켓 정합성 확인)
4. 캔들 매니저 시작 (과거 데이터 동기화 + WebSocket 실시간 수집)
5. 캔들 종가 콜백 등록 (트레이딩 파이프라인 트리거)
6. Reconciliation 워커 시작 (60초 주기)
7. API 서버 시작 (웹 UI 제공)
8. SIGTERM/SIGINT 시그널 핸들러 등록

## 2.2 데몬 정지

```bash
# 정상 종료 (권장)
# 실행 중인 터미널에서 Ctrl+C (SIGINT)
# 또는
kill -TERM $(pgrep -f "bun run daemon")
```

### 정상 종료 절차

1. API 서버 종료 (신규 요청 차단)
2. 캔들 매니저 종료 (WebSocket 연결 해제)
3. 미체결 주문 취소
4. Reconciliation 워커 종료
5. DB 연결 풀 정리
6. Slack "DAEMON_STOP" 알림 발송

> **중요**: 정상 종료 시 **포지션을 청산하지 않습니다**.
> SL이 거래소에 등록되어 있어 데몬이 꺼져도 손절은 보호됩니다.
> 단, TP와 Trailing Stop은 데몬 재시작 전까지 작동하지 않습니다.

## 2.3 실행 모드

시스템은 심볼별로 3가지 실행 모드를 지원합니다:

| 모드 | 동작 | 용도 |
|------|------|------|
| `analysis` | 신호 생성만, 주문 실행 안 함 | 전략 검증, 초기 관찰 |
| `alert` | 신호 생성 + Slack 알림, 주문 실행 안 함 | 수동 확인 단계 |
| `live` | 신호 생성 + 주문 자동 실행 | 실거래 |

실행 모드는 DB의 `symbol_state` 테이블에서 심볼별로 관리됩니다.

### 모드 변경

```sql
-- BTCUSDT를 라이브 모드로 전환
UPDATE symbol_state
SET execution_mode = 'live'
WHERE symbol = 'BTCUSDT';

-- 전체 심볼을 분석 모드로 전환 (거래 중단)
UPDATE symbol_state
SET execution_mode = 'analysis';
```

> 모드 변경 후 데몬 재시작은 불필요합니다. 다음 파이프라인 실행부터 적용됩니다.

## 2.4 주요 명령어 요약

| 명령어 | 설명 |
|--------|------|
| `bun run dev` | 개발 모드 (--watch) |
| `bun run daemon` | 프로덕션 데몬 실행 |
| `bun run backtest` | 백테스트 CLI |
| `bun test` | 테스트 실행 |
| `bun run lint` | Biome 린트 검사 |
| `bun run typecheck` | TypeScript 타입 검사 |
| `bun run build` | 웹 UI 빌드 (Vite) |
| `bun run migrate` | DB 마이그레이션 |
| `bun run seed` | 초기 설정 데이터 투입 |
| `bun run check-layers` | 레이어 의존성 검증 |

### 운영 스크립트

| 스크립트 | 설명 |
|----------|------|
| `bun scripts/kill-switch.ts` | **긴급 정지** — 전체 포지션 청산 + 거래 중단 |
| `bun scripts/transfer-now.ts` | 수동 선물→현물 이체 |
| `bun scripts/transfer-now.ts --dry-run` | 이체 시뮬레이션 (실제 이체 없음) |
| `bun scripts/seed.ts` | 설정 데이터 시드 |
| `bun scripts/bench-indicators.ts` | 지표 연산 벤치마크 |

## 2.5 일일 점검 사항

매일 아래 항목을 점검하세요:

- [ ] 데몬 프로세스 정상 실행 중
- [ ] Slack 알림 정상 수신
- [ ] Reconciliation 일치율 >= 99%
- [ ] 거래소 WebSocket 연결 상태 정상
- [ ] 비정상 로그 없음 (`warn` 레벨 이상)
- [ ] 일일 손실 한도 미초과
- [ ] DB 디스크 사용량 확인

## 2.6 배포 단계별 운영

시스템은 4단계를 거쳐 점진적으로 운영합니다:

| 단계 | 모드 | 기간 | 자본 | 조건 |
|------|------|------|------|------|
| 1 | — | — | — | 백테스트 기대값 > 0 확인 |
| 2 | `analysis` | 2주 이상 | 30만원 | 신호만 관찰 |
| 3 | `alert` | 2주 이상 | — | 10건 이상 완료 거래 확인 |
| 4 | `live` | — | 3천만원 | risk_pct 1% |

각 단계를 충분히 검증한 후에만 다음 단계로 전환하세요.
