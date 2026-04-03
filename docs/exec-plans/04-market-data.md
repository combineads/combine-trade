# 04-market-data

## Objective
멀티 타임프레임 캔들 수집 시스템을 구축한다. Binance public data 기반 히스토리 로더, WebSocket 실시간 스트림, 갭 복구를 포함한다.

## Scope
- `src/candles/` (L3): 캔들 수집기, 히스토리 로더, 갭 복구
- 지원 타임프레임: 1D, 1H, 5M, 1M
- 거래소별 독립 수집 (같은 심볼이라도 거래소마다 가격 다름)

## Non-goals
- 지표 계산 (EP-02)
- 벡터 생성 (EP-05)
- 백테스트용 캔들 시뮬레이션 (EP-11)
- 데몬 파이프라인 오케스트레이션 (EP-09)

## Prerequisites
- EP-01 M2 (db — Candle 테이블) 완료
- EP-03 M2 (exchanges — WebSocket) 완료 — M1(히스토리 로더)는 Binance public data 직접 다운로드로 EP-03 불필요

## Milestones

### M1 — 히스토리 캔들 로더 (Binance Public Data)
- Deliverables:
  - `src/candles/history-loader.ts` — Binance public data (data.binance.vision) 기반 히스토리 로드
    - Monthly ZIP 다운로드 (과거 완결 월): `data.binance.vision/data/futures/um/monthly/klines/{SYMBOL}/{INTERVAL}/`
    - Daily ZIP 다운로드 (현재 월, 전일까지): `data.binance.vision/data/futures/um/daily/klines/{SYMBOL}/{INTERVAL}/`
    - CSV 파싱 → DB 벌크 UPSERT
  - `src/candles/sync.ts` — 데몬 시작 시 호출되는 동기화 로직
    - DB 최신 캔들 시각 확인 → 누락 구간 자동 다운로드
    - **전일까지 항상 덮어쓰기**: 마지막 일자 데이터를 항상 재다운로드 (미완결 캔들 보정)
  - 데이터 보존 기간: 1D/1H/5M = 3년, 1M = 6개월 rolling
- Acceptance criteria:
  - 4개 타임프레임 × N 심볼 히스토리 로드 성공
  - 중복 캔들 무시 (UNIQUE 제약, UPSERT on conflict)
  - 전일까지의 데이터가 항상 최신 보장
  - Monthly ZIP → Daily ZIP 2단계 전략으로 다운로드 최소화
  - CCXT REST API fallback (public data 다운 시)
- Validation:
  - `bun test -- --grep "history-loader"`
  - DB에 캔들 삽입 확인
  - 전일까지 갭 없음 확인

### M2 — 실시간 캔들 수집기
- Deliverables:
  - `src/candles/collector.ts` — WebSocket kline 이벤트 → DB 저장
  - 캔들 마감 감지 (`is_closed` 전환)
  - 캔들 마감 이벤트 발행 (콜백/이벤트)
- Acceptance criteria:
  - 실시간 캔들 수신 → DB 저장 정상 동작
  - 마감 캔들만 파이프라인 트리거
  - 미마감 캔들은 업데이트 (가장 최근 값 유지)
- Validation:
  - `bun test -- --grep "collector"`

### M3 — 갭 복구
- Deliverables:
  - `src/candles/gap-recovery.ts` — DB 내 캔들 갭 감지 & REST 보완
  - WebSocket 재연결 후 자동 갭 검사
  - 데몬 시작 시 갭 검사
- Acceptance criteria:
  - 연결 끊김 후 누락 캔들 자동 복구
  - 갭 복구 중에도 실시간 수집 계속
  - 복구 완료 로그
- Validation:
  - `bun test -- --grep "gap-recovery"`

## Task candidates
- T-04-001: db/migrations/002 — Candle 테이블 마이그레이션
- T-04-002: candles/history-loader.ts — Binance public data ZIP 다운로드 & CSV 파싱 (monthly + daily 2단계)
- T-04-003: candles/history-loader.ts — 벌크 UPSERT (중복 처리, CCXT REST fallback)
- T-04-004: candles/sync.ts — 데몬 시작 시 전일까지 동기화 (덮어쓰기 포함)
- T-04-005: candles/cleanup.ts — 1M 데이터 6개월 rolling 정리
- T-04-006: candles/collector.ts — WebSocket 캔들 수집기 기본
- T-04-007: candles/collector.ts — 캔들 마감 감지 & 이벤트 발행
- T-04-008: candles/gap-recovery.ts — 갭 감지 로직
- T-04-009: candles/gap-recovery.ts — REST 보완 로드 & 자동 복구
- T-04-010: candles/index.ts — 통합 API (시작/중지/상태)

## Risks
- **WebSocket 안정성**: Bun WebSocket 클라이언트의 24/7 안정성 미검증. 대안: ws 패키지 사용.
- **Binance public data 가용성**: data.binance.vision 다운로드 실패 가능. 대안: CCXT REST API fallback.
- **대량 데이터 초기 로드**: 3년치 5M 캔들 (~315K행/심볼) + 1M (~1.58M행) 초기 삽입 시간. 대안: 벌크 INSERT 최적화.
- **타임프레임 정합성**: 1D/1H 마감 시각 계산의 거래소별 차이. Binance는 UTC 기준.

## Decision log
- 캔들 마감 이벤트는 콜백 패턴 (EventEmitter가 아닌 함수 콜백 — 타입 안전)
- 히스토리 로더는 Binance public data (data.binance.vision) 사용 — REST API 대비 레이트리밋 없이 대량 다운로드 가능
- 데몬 시작 시마다 전일까지 데이터 동기화 (항상 마지막 일자 덮어쓰기 — 미완결 캔들 보정)
- 1M 데이터는 6개월 rolling — 초과분 주기적 삭제 (1D/1H/5M은 3년 보존)
- 미마감 캔들도 DB에 저장 (대시보드 표시용) — is_closed=false
- Candle 테이블은 이 에픽의 마이그레이션에서 생성 (EP-01에서 Master/Reference만 생성)

## Consensus Log
- Round 1-2: EP-01~EP-11 전체 컨센서스 — 상세 로그는 01-foundation.md 참조
- Verdict: 2라운드 만에 컨센서스 달성

## Progress notes
- (작업 전)
