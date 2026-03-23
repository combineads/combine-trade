# T-206 Double-BB historical data loader (Binance Vision 3-tier)

## Goal
3년치 BTCUSDT 1m 캔들 데이터를 Binance Vision 아카이브(월간 ZIP → 일간 ZIP → REST fallback) 방식으로 bulk 다운로드하는 스크립트를 구현한다.

## Why
Double-BB 전략 백테스트(T-207)에 약 157만 건의 1m 캔들이 필요하다.
EP05-M1에서 Binance Vision 다운로더가 "deferred"로 남겨졌고, 현재 CSV 파서만 존재한다.

## Inputs
- `packages/backtest/` — 기존 CSV 파서 (T-038 결과물)
- `db/index.ts` — Drizzle 싱글턴
- `db/schema/candles.ts` — candles 테이블 스키마
- EP05 exec-plan M1 — 3-tier 백필 상세 스펙

## Dependencies
T-197

## Expected Outputs
- `scripts/backfill-candles.ts` — CLI 스크립트
- `scripts/__tests__/backfill-candles.test.ts` — 유닛 테스트 (HTTP mock)

## Deliverables
- `scripts/backfill-candles.ts`:
  - CLI args: `--exchange`, `--symbol`, `--timeframe`, `--years`
  - Tier 1: Binance Vision 월간 ZIP (`data.binance.vision/.../monthly/klines/...`)
  - Tier 2: Binance Vision 일간 ZIP (당월 갭 커버)
  - Tier 3: REST `fetchOHLCV()` (마지막 ~1일)
  - SHA256 CHECKSUM 검증 (각 ZIP 파일)
  - 멱등성: 이미 저장된 구간 스킵
  - 진행률 출력 (%, tier별 상태)
  - 완료 후 연속성 검증 자동 실행
- `scripts/__tests__/backfill-candles.test.ts`:
  - HTTP mock으로 Tier 1 ZIP 다운로드 테스트
  - CHECKSUM 검증 실패 시 에러 발생 확인
  - 멱등성 스킵 로직 테스트

## Constraints
- SHA256 CHECKSUM 검증 실패 시 INSERT 금지
- 멱등성 필수 (재실행 시 중복 INSERT 없음)
- Tier 3 REST: CCXT rate limiter 준수
- raw SQL 금지 — CandleRepository 인터페이스 사용

## Steps
1. `packages/backtest/` 기존 CSV 파서 코드 읽기
2. ZIP 다운로드 + SHA256 검증 유틸 구현
3. Tier 1 (월간 아카이브) 다운로드 + CSV 파싱 + insert 구현
4. Tier 2 (일간 아카이브) 구현
5. Tier 3 (REST fallback) 구현
6. 멱등성 스킵 로직 (최신 candle open_time 조회)
7. 진행률 + 완료 후 연속성 검증 추가
8. 유닛 테스트 작성
9. `bun run typecheck` 확인

## Acceptance Criteria
- `bun run scripts/backfill-candles.ts --exchange binance --symbol BTCUSDT --timeframe 1m --years 1` 에러 없이 완료
- 재실행 시 기존 데이터 스킵 (멱등성)
- SHA256 검증 수행
- 진행률 % 출력
- 완료 후 연속성 검증 통과
- `bun run typecheck` 통과
- 유닛 테스트 통과

## Validation
```bash
bun run typecheck
bun test scripts/__tests__/backfill-candles.test.ts
# 실제 DB + 네트워크 환경에서:
# bun run scripts/backfill-candles.ts --exchange binance --symbol BTCUSDT --timeframe 1m --years 1
```

## Out of Scope
OKX backfill, 재벡터화 (EP05-M4), 백테스트 실행 (T-207)
