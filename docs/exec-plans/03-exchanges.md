# 03-exchanges

## Objective
CCXT 기반 거래소 어댑터를 구현한다. ExchangeAdapter 포트를 구현하여 Binance를 우선 지원하고, OKX/Bitget/MEXC 확장 가능한 구조를 만든다.

## Scope
- `src/exchanges/` (L2): ExchangeAdapter 구현체
  - Binance Futures (Phase 1 — 이 에픽에서 완성)
  - OKX, Bitget, MEXC (Phase 2/3 — 스캐폴드만)

## Non-goals
- WebSocket 캔들 수집 로직 (EP-04)
- 주문 실행 비즈니스 로직 (EP-06)
- 테스트넷 자동 배포

## Prerequisites
- EP-01 M1 (core/ports.ts — ExchangeAdapter 인터페이스) 완료

## Milestones

### M1 — CCXT 통합 기반 & Binance 어댑터
- Deliverables:
  - `src/exchanges/base.ts` — CCXT 공통 래퍼 (인증, 레이트리밋, 에러 매핑)
  - `src/exchanges/binance.ts` — BinanceAdapter 구현
  - ExchangeAdapter 인터페이스 메서드 전체 구현:
    - `fetchBalance()`, `fetchPositions()`, `fetchOrders()`
    - `createOrder()`, `cancelOrder()`, `editOrder()`
    - `setSL()`, `setLeverage()`
    - `subscribeKlines()`, `unsubscribeKlines()`
- Acceptance criteria:
  - Binance Futures 테스트넷에서 주문 생성/취소 성공
  - 레이트리밋 (1200 req/min) 준수
  - 에러 시 지수 백오프 (1s→2s→4s, max 30s)
  - 모든 가격/사이즈가 Decimal.js
- Validation:
  - `bun test -- --grep "binance"` (mock 테스트)
  - 테스트넷 통합 테스트 (수동)

### M2 — WebSocket 스트림 관리
- Deliverables:
  - `src/exchanges/ws-manager.ts` — WebSocket 연결 관리, 자동 재연결
  - Binance WebSocket kline 스트림 구독/해제
  - 연결 끊김 감지 → 재연결 (1s→2s→4s, max 30s)
- Acceptance criteria:
  - 다중 심볼×타임프레임 동시 구독
  - 30초 이내 자동 재연결
  - 재연결 후 갭 감지 → REST 보완 요청 트리거
- Validation:
  - `bun test -- --grep "ws-manager"`

### M3 — OKX/Bitget/MEXC 스캐폴드
- Deliverables:
  - `src/exchanges/okx.ts` — OkxAdapter (기본 구조, 주요 메서드)
  - `src/exchanges/bitget.ts` — BitgetAdapter (기본 구조)
  - `src/exchanges/mexc.ts` — MexcAdapter (기본 구조, 2-step SL 고려)
  - 거래소별 특이사항 문서화
- Acceptance criteria:
  - 4개 어댑터 모두 ExchangeAdapter 인터페이스 구현 (컴파일 통과)
  - Binance 외는 `throw new Error("Not implemented")` 허용
  - MEXC 2-step SL 플로우 설계 문서화
- Validation:
  - `bun run typecheck`

## Task candidates
- T-03-001: exchanges/base.ts — CCXT 공통 래퍼 (인증, 레이트리밋)
- T-03-002: exchanges/binance.ts — BinanceAdapter 기본 구현 (잔고/포지션 조회)
- T-03-003: exchanges/binance.ts — 주문 생성/취소/수정
- T-03-004: exchanges/binance.ts — SL 등록/레버리지 설정
- T-03-005: exchanges/ws-manager.ts — WebSocket 연결 관리자
- T-03-006: exchanges/binance.ts — Binance WebSocket kline 구독
- T-03-007: exchanges/okx.ts — OKX 어댑터 스캐폴드
- T-03-008: exchanges/bitget.ts — Bitget 어댑터 스캐폴드
- T-03-009: exchanges/mexc.ts — MEXC 어댑터 스캐폴드 (2-step SL 설계)
- T-03-010: 거래소 어댑터 통합 테스트 (Binance 테스트넷)

## Risks
- **CCXT Bun 호환성**: CCXT가 Node.js 기반이므로 Bun에서 일부 기능 동작 안 할 수 있음. 대안: Bun의 Node.js 호환 레이어 활용.
- **테스트넷 가용성**: Binance 테스트넷이 불안정할 수 있음. 대안: Mock 기반 테스트 우선.
- **MEXC 2-step SL**: editOrder 미지원 시 cancel+create 필요 — 타이밍 리스크. 대안: 설계만 이 에픽에서, 구현은 Phase 3.

## Decision log
- Binance 우선 구현 (ARCHITECTURE.md Exchange rollout strategy 준수)
- WebSocket 관리를 별도 모듈로 분리 (exchanges 폴더 내) — WS 연결 수명주기(재연결, heartbeat)는 exchanges 담당, 캔들 데이터 해석/저장은 candles(EP-04) 담당
- OKX/Bitget/MEXC는 인터페이스 준수 스캐폴드만 (Phase 2/3에서 완성)
- CCXT + Bun 호환성은 EP-01 M0 spike에서 사전 검증됨

## Consensus Log
- Round 1-2: EP-01~EP-11 전체 컨센서스 — 상세 로그는 01-foundation.md 참조
- Verdict: 2라운드 만에 컨센서스 달성

## Progress notes
- (작업 전)
