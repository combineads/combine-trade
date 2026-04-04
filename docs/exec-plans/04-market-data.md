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
- EP-01 (foundation) 완료 ✅ — db/schema.ts에 Symbol/SymbolState/CommonCode 정의됨. 아카이빙: `docs/tasks/archive/ep-01-foundation/`
- EP-02 (indicators) 완료 ✅ — 아카이빙: `docs/tasks/archive/ep-02-indicators/`
- EP-03 M2 (exchanges — WebSocket) 완료 ✅ — ws-manager.ts 구현됨, 10/10 태스크 done
- **참고:** Candle 테이블은 EP-01 기반 마이그레이션에 미포함 (Master/Reference만). T-04-001에서 생성
- **참고:** M1(히스토리 로더)는 Binance public data 직접 다운로드로 EP-03 불필요

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

## Task candidates → Generated tasks mapping
- T-04-000: docker-compose.yml + tests/helpers/test-db.ts — DB 테스트 인프라 (PostgreSQL 16 + pgvector)
- T-04-001: db/schema.ts — Candle 테��블 Drizzle 스키마 & 마이그레이션
- T-04-002: candles/history-loader.ts — Binance public data ZIP 다운로드 & CSV 파싱 + CCXT REST fallback
- T-04-003: candles/repository.ts — 벌크 UPSERT, 조회 헬퍼
- T-04-004: candles/sync.ts — 데몬 시작 시 전일까지 동기화 (덮어쓰기 포함)
- T-04-005: candles/cleanup.ts — 1M 데이터 6개월 rolling 정리
- T-04-006: candles/collector.ts — WebSocket 실시간 캔들 수집기
- T-04-007: candles/collector.ts + types.ts — 캔들 마감 감지 & 콜백 이벤트 발행
- T-04-008: candles/gap-detection.ts — 갭 감지 로직
- T-04-009: candles/gap-recovery.ts — REST 보완 로드 & 자동 복구
- T-04-010: candles/index.ts — CandleManager 통합 API (시작/중지/상태)

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
- 거래소별 독립 수집이 Scope에 있으나 Phase 1은 Binance만 — OKX/Bitget/MEXC 수집은 해당 거래소 Phase에서 추가

## Consensus Log
- Round 1-2: EP-01~EP-11 전체 컨센서스 — 상세 로그는 01-foundation.md 참조
- Verdict: 2라운드 만에 컨센서스 달성

## Progress notes
- 2026-04-04: 에픽 분석 완료. 전제조건 EP-01/02/03 모두 충족. EP-01/02 아카이빙 확인.
- 2026-04-04: 태스크 생성 완료 (10개). 의존성 체인: T-04-001(스키마) → T-04-002/003(로더/repo) → T-04-004(sync) / T-04-006→007(수집기) / T-04-008→009(갭) → T-04-010(통합).
- 2026-04-04: 태스크 리뷰 완료. Critical 3건 수정: (1) fetchCandlesViaREST를 T-04-003→T-04-002로 이동 (one-deliverable 준수), (2) getCandleGaps 중복 제거 — T-04-008이 갭 감지 전���, (3) T-04-006에 reconnection 이벤트 추���. Important 4건 수정: exchange 파라미터/is_closed 감지/DELETE 패턴/심볼 소스 명확화.
- 2026-04-04: DB 테스트 인프라 추가. T-04-000 신설 (docker-compose + test-db 헬퍼). EP-04부터 모든 DB 연동 태스크가 실제 PostgreSQL에서 통합 테스트 실행. mock DB 금지. 의존성 체인: T-04-000→T-04-001→나머지 (전이적 의존).
- 2026-04-04: **에픽 완료.** 11개 태스크 (T-04-000 ~ T-04-010) 모두 done. 865 tests, 0 fail, typecheck pass, lint pass. 아카이빙: `docs/tasks/archive/ep-04-market-data/`. EP-03도 함께 아카이빙 (`docs/tasks/archive/ep-03-exchanges/`).
