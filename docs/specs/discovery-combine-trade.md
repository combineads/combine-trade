# Discovery: Combine Trade

## Date
2026-03-21

## Problem statement
재량적(discretionary) 트레이딩에서 진입 판단의 일관성이 부족하다. 과거 유사 패턴의 통계적 근거 없이 감에 의존하는 의사결정을 제거하기 위해, 전략이 정의한 이벤트를 벡터화하고 동일 전략·버전·심볼 내 과거 패턴 통계로 롱/숏/패스를 결정하는 시스템이 필요하다.

## Goal
전략 개발자가 TypeScript로 전략을 작성하면, 시스템이 자동으로 이벤트 감지 → 벡터화 → 유사 패턴 검색 → 통계 기반 의사결정 → 알람/자동매매까지 수행하는 end-to-end 트레이딩 플랫폼을 구축한다.

## System one-line definition
전략이 정의한 방식으로 이벤트를 벡터화하고, 동일 전략·버전·심볼 내 과거 패턴 통계로 롱/숏/패스를 결정하는 시스템.

## Core pipeline
```
캔들 close(0초) → 전략 조건 평가 → 이벤트 생성 → 벡터화([0,1]) → L2 유사 검색 → 통계 → 판단 → 알람/매매
```

## Scope

### In scope
- **동적 전략 시스템**: TypeScript로 전략 작성, DB 저장, 런타임 샌드박스 실행
- **Pine Script 수준 API**: 캔들 데이터 접근, 기술지표 함수 라이브러리, 타임프레임 접근, OHLCV 기반 로직 개발
- **벡터 정의 필수화**: 전략 코드에서 features[] 정규화 방식 필수 정의
- **커스텀 매매 조건**: 전략에서 매수/매도 조건 정의 가능 (미정의 시 기본값 적용)
- **이벤트 벡터화**: 전략 정의 features → [0,1] 정규화 → L2 유사 검색
- **통계 기반 의사결정**: winrate ≥ 55%, expectancy > 0, min_samples ≥ 30
- **결과 라벨링**: TP/SL/TIME_EXIT 판정, pnl_pct/mfe_pct/mae_pct/hold_bars 기록
- **백테스트**: 3년치 과거 데이터로 전략 검증 + 벡터 생성
- **실행 모드**: 분석 → Slack 알람 → 모의매매 → 자동매매 (모두 MVP에 포함) — Four execution modes: Analysis → Alert → Paper trading → Auto-trading (all in MVP)
- **멀티 전략/심볼/거래소**: 복수 전략 동시 운영, BTCUSDT/ETHUSDT/SOLUSDT, Binance/OKX
- **격리 원칙**: 벡터 검색은 동일 전략 + 동일 버전 + 동일 심볼 내에서만
- **UI**: Tauri 데스크탑/모바일 앱 + Next.js 웹사이트
- **버전 관리**: 새 버전 = 새 벡터 테이블 + 과거 데이터 재벡터화

### Out of scope
- 멀티유저/SaaS
- 현물(Spot) 거래
- 소셜/카피 트레이딩
- 전략 마켓플레이스

## Strategy definition spec
```
strategy_id, version, name
symbols, timeframe, direction (LONG|SHORT)

# 이벤트
event_condition          — 발생 조건 (TypeScript 코드)

# 벡터
features[]               — feature 목록 + 정규화 방식
dimension                — features 길이

# 검색
similarity_metric        — L2 (기본)
top_k                    — 50
similarity_threshold     — √d × 0.3
min_samples              — 30

# 결과 판정
tp_pct, sl_pct, max_hold_bars

# 의사결정
min_winrate              — 55%
min_expectancy           — > 0
```

## Dynamic strategy system

### Architecture
- 전략 코드를 UI에서 TypeScript로 작성
- DB에 저장 (코드 + 메타데이터 + 버전)
- 런타임에서 샌드박스 환경으로 실행

### Strategy API (Pine Script level)
- **캔들 데이터**: OHLCV 접근, 히스토리컬 데이터 조회
- **기술지표 함수**: SMA, EMA, BB, RSI, MACD, ATR 등 내장 제공
- **타임프레임 접근**: 멀티 타임프레임 데이터 참조
- **OHLCV 로직**: 직접 로직 개발 가능
- **벡터 정의**: features[] + 정규화 방식 필수 정의
- **매매 조건**: 커스텀 매수/매도 조건 (선택, 미정의 시 기본값)

### Strategy code outputs
1. `event_condition` — 이벤트 발생 여부
2. `features[]` — 벡터화할 피처 배열 + 정규화 방식
3. `entry/exit conditions` — (선택) 커스텀 매매 조건

## Normalization rules (all features → [0, 1])

| 유형 | 방식 |
|------|------|
| 비율/퍼센트 | / 100 |
| 변화율·이격도 | sigmoid |
| 거래량·변동성 | rolling percentile |
| 카운트 | min-max (도메인 고정) |
| boolean | 0 또는 1 |

## Result (label) judgment

이벤트 후 `max_hold_bars` 동안 순회:
- TP 먼저 도달 → **WIN**
- SL 먼저 도달 → **LOSS**
- 동시 도달 → **LOSS** (`sl_hit_first` 플래그)
- 시간 만료 → **TIME_EXIT**

기록 필드: `result_type`, `pnl_pct`, `mfe_pct`, `mae_pct`, `hold_bars`, `exit_price`, `sl_hit_first`

## Decision logic

```
유효 샘플 ≥ 30
AND winrate ≥ 55%
AND expectancy > 0
→ 전략 direction 방향 진입

미충족 → 패스

expectancy = (winrate × avg_win) − ((1 − winrate) × avg_loss)
```

## Isolation principles
- 벡터 검색 범위: 동일 전략 + 동일 버전 + 동일 심볼
- 전략 간 벡터 비교 금지
- 심볼 간 교차 검색 금지

## Storage structure
- **이벤트**: 공통 테이블
- **벡터**: 전략·버전별 물리 테이블 분리 + pgvector HNSW 인덱스
- **캔들**: 거래소·심볼·타임프레임별 저장

## Version management
- 새 버전 = 새 벡터 테이블 생성
- 과거 데이터 재벡터화 (3년치 백테스트 재실행)

## Constraints

### Technical stack
- **Runtime**: Bun
- **Backend framework**: Elysia
- **Cross-cutting**: AOP (트랜잭션 관리, 로깅)
- **DI**: IoC 컨테이너
- **ORM**: DrizzleORM
- **Database**: PostgreSQL + pgvector
- **Desktop/Mobile UI**: Tauri
- **Web UI**: Next.js
- **Strategy execution**: TypeScript 샌드박스 (DB 저장 + 런타임 실행)

### Target markets
- 거래소: Binance, OKX
- 심볼: BTCUSDT, ETHUSDT, SOLUSDT (perpetual futures)
- 확장: 거래소·심볼 제약 없이 추가 가능한 아키텍처

### Performance
- 캔들 close → 알람/매매: **1초 이내**
- 3년치 1전략 백테스트: **수 분 이내**
- 동시 운영 전략/심볼 수: 아키텍처 제약 없음

### Operational
- 24/7 무중단 목표
- 초기 운영: 로컬 노트북 1인 사용
- 아키텍처: 향후 서버 배포, 스케일 아웃 가능하도록 설계

## Execution modes
1. **분석 모드**: 데이터 수집, 이벤트 감지, 패턴 분석
2. **알람 모드**: Slack 알람 발송
3. **모의매매 모드 (paper trading)**: 실시간 시장 데이터 기반 가상 체결 시뮬레이션. 실제 자금 위험 없음. 라이브 모드와 동일한 전략 평가 파이프라인 사용. 체결 기록은 트레이드 저널에 `paper_trade` 플래그와 함께 저장.
4. **자동매매 모드**: 실제 주문 실행

MVP에서 4가지 모드 모두 포함.

## Expansion axes
- 멀티 전략
- 멀티 심볼
- 멀티 거래소
- 멀티 타임프레임

## Success criteria
- [ ] TypeScript 전략 코드를 UI에서 작성하고 저장하면 시스템이 실행할 수 있다
- [ ] 전략 코드에서 Pine Script 수준의 기술지표/캔들 API를 사용할 수 있다
- [ ] 전략이 정의한 features[]가 [0,1]로 정규화되어 벡터로 저장된다
- [ ] 동일 전략·버전·심볼 내에서만 L2 유사 검색이 수행된다
- [ ] 유사 패턴 통계(winrate, expectancy)가 올바르게 계산된다
- [ ] 의사결정 기준(≥30샘플, ≥55% winrate, >0 expectancy) 충족 시 진입 신호가 발생한다
- [ ] 3년치 백테스트 완료 시 벡터가 생성되고 통계가 축적된다
- [ ] 캔들 close 후 1초 이내에 알람/매매 신호가 발생한다
- [ ] 3년치 1전략 백테스트가 수 분 이내에 완료된다
- [ ] Slack 알람이 정상 발송된다
- [ ] Binance/OKX에서 자동매매 주문이 실행된다
- [ ] 결과 라벨(WIN/LOSS/TIME_EXIT)이 정확히 판정된다
- [ ] 전략 버전 변경 시 새 벡터 테이블이 생성되고 재벡터화가 수행된다
- [ ] Tauri 앱과 Next.js 웹에서 전략 관리/모니터링이 가능하다

## Ambiguity score
- Goal: 0.90 / 1.0
- Constraints: 0.85 / 1.0
- Criteria: 0.75 / 1.0
- **Overall ambiguity: 17% (threshold: 20%) ✅**

## Q&A transcript

### Round 1 — Criteria: MVP 범위
- Q: 이 새 시스템의 MVP 범위를 구체적으로 어디까지로 잡고 계신가요? (실행 모드, 전략 수, 심볼/거래소, UI)
- A: 분석 + Slack 알람 + 자동매매 모두 포함. 복수 전략 동적 추가 가능. TypeScript로 Pine Script처럼 전략 개발. 3년치 백테스트로 벡터 생성. BTCUSDT/ETHUSDT/SOLUSDT, Binance/OKX. 백엔드 Bun + Elysia + AOP + IoC/DI + DrizzleORM + PG. UI는 Tauri(모바일/데스크탑) + Next.js(웹).
- Score update: Goal 0.80→0.85, Constraints 0.55→0.75, Criteria 0.45→0.55

### Round 2 — Constraints: 전략 DSL 아키텍처
- Q: 전략 TypeScript 코드가 시스템에 어떻게 통합되는 방식을 구상하고 계신가요? (파일 플러그인/DB 런타임/모노레포)
- A: B) DB 저장 + 런타임 샌드박스 실행. Pine Script 수준 API 제공 (캔들 데이터, 기술지표 함수, 타임프레임 접근, OHLCV 로직). 벡터 features 정의 필수. 매수/매도 조건도 커스텀 가능 (미정의 시 기본값).
- Score update: Goal 0.85→0.90, Constraints 0.75→0.80

### Round 3 — Criteria: 성공 기준
- Q: 레이턴시, 백테스트 성능, 동시 운영 규모, 가동률 기대치는?
- A: 캔들 close → 알람/매매 1초 이내. 3년 1전략 백테스트 수 분. 동시 운영 규모 제약 없음 (초기 소규모, 확장 가능). 24/7 무중단 (초기 로컬 노트북, 아키텍처 제약 없이).
- Score update: Constraints 0.80→0.85, Criteria 0.55→0.75

## Open questions

> All questions below have been resolved. See PRODUCT.md for resolution details.

- 전략 샌드박스 실행 환경의 보안 모델 (격리 수준, 리소스 제한)
- Tauri 앱과 Next.js 웹의 코드 공유 전략 (공통 컴포넌트 라이브러리?)
- 자동매매 리스크 관리: 킬스위치, 일일 손실 한도, 포지션 사이즈 관리 수준
- 캔들 데이터 소스: Binance Vision 아카이브 + REST + WebSocket 조합?
- 전략 코드 에디터: Monaco 등 코드 에디터 내장? 자동완성/타입체크 지원?

## Next step
Run `harness-project-bootstrap` or `harness-epic-planner` with this spec as input.
