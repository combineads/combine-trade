# Combine Trade

전략이 정의한 방식으로 이벤트를 벡터화하고, 동일 전략·버전·심볼 내 과거 패턴 통계로 **LONG / SHORT / PASS**를 결정하는 암호화폐 선물 트레이딩 시스템.

```
캔들 close → 전략 평가 → 이벤트 생성 → 벡터화([0,1]) → L2 유사 검색 → 통계 → 판단 → 알람/매매
```

---

## 목차

- [시스템 개요](#시스템-개요)
- [레포지터리 구조](#레포지터리-구조)
- [사전 요구사항](#사전-요구사항)
- [빠른 시작](#빠른-시작)
- [환경 변수](#환경-변수)
- [개발 명령어](#개발-명령어)
- [워커 실행](#워커-실행)
- [백필 방법](#백필-방법)
- [백테스트 실행](#백테스트-실행)
- [전략 작성 가이드](#전략-작성-가이드)
- [실행 모드](#실행-모드)
- [API 엔드포인트](#api-엔드포인트)
- [데이터베이스](#데이터베이스)

---

## 시스템 개요

### 파이프라인 흐름

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   Candle     │ →  │   Strategy   │ →  │   Vector     │ →  │  Decision    │
│  Collector   │    │   Worker     │    │   Worker     │    │  Engine      │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
      ↑                   ↑                                        │
   WebSocket          V8 Sandbox                            ┌──────────────┐
   (거래소 WS)        (TypeScript)                           │  Alert /     │
                                                            │  Execution   │
                                                            └──────────────┘
```

### 의사결정 기준

| 조건 | 기준 |
|------|------|
| 최소 샘플 수 | ≥ 30개 유사 패턴 |
| 최소 승률 | ≥ 55% |
| 기대수익 | > 0 |

세 조건을 모두 충족할 때만 LONG/SHORT 신호를 발생시킵니다. 미충족 시 PASS.

---

## 레포지터리 구조

```
combine-trade/
├── apps/
│   ├── api/                    # Elysia REST API 서버 (포트 3000)
│   └── web/                    # Next.js 웹 UI (SSR/SSG)
├── packages/
│   ├── core/
│   │   ├── strategy/           # 전략 샌드박스 (V8 isolates)
│   │   ├── vector/             # 벡터화 + pgvector 검색
│   │   ├── decision/           # 통계 기반 의사결정 엔진
│   │   ├── label/              # 결과 레이블링 (WIN/LOSS/TIME_EXIT)
│   │   ├── indicator/          # 기술지표 라이브러리
│   │   ├── journal/            # 트레이드 저널
│   │   ├── risk/               # 킬스위치 + 손실 한도 + 포지션 사이징
│   │   ├── fee/                # 수수료 계산
│   │   ├── macro/              # 거시경제 컨텍스트
│   │   └── supervisor/         # 워커 수퍼바이저 유틸리티
│   ├── exchange/               # CCXT 거래소 어댑터 (Binance, OKX)
│   ├── candle/                 # 캔들 수집 + 연속성 검증
│   ├── backtest/               # 백테스트 엔진
│   ├── alert/                  # Slack 알람
│   ├── execution/              # 주문 실행 (real + paper)
│   ├── ui/                     # 공통 React 컴포넌트
│   └── shared/                 # 공통 타입, IoC, AOP, 암호화, 이벤트 버스
├── workers/
│   ├── candle-collector/       # 실시간 캔들 수집 (거래소 WebSocket)
│   ├── strategy-worker/        # 전략 이벤트 평가
│   ├── vector-worker/          # 벡터화 + 유사 검색 + 의사결정
│   ├── label-worker/           # 지연 결과 레이블링
│   ├── alert-worker/           # Slack 알람 발송
│   ├── execution-worker/       # 주문 실행
│   ├── journal-worker/         # 트레이드 저널 생성
│   ├── macro-collector/        # 거시경제 이벤트 수집
│   ├── retrospective-worker/   # LLM 회고 리포트 생성
│   └── llm-decision-worker/    # LLM 2단계 의사결정 필터
├── db/
│   ├── schema/           # DrizzleORM 스키마
│   ├── migrations/       # 마이그레이션 파일
│   └── seed/             # 개발용 시드 데이터
├── scripts/
│   └── supervisor.ts     # 워커 프로세스 수퍼바이저
├── tests/
├── docker-compose.yml    # PostgreSQL + pgvector
└── .env.example
```

---

## 사전 요구사항

| 도구 | 버전 | 비고 |
|------|------|------|
| [Bun](https://bun.sh) | ≥ 1.1 | 런타임 + 패키지 매니저 |
| [Docker](https://docker.com) | ≥ 24 | PostgreSQL + pgvector 컨테이너 |
| [Docker Compose](https://docs.docker.com/compose/) | v2 | `docker compose` 명령어 사용 |

---

## 빠른 시작

```bash
# 1. 레포지터리 클론
git clone <repo-url>
cd combine-trade

# 2. 환경 변수 설정
cp .env.example .env
# .env 파일을 열어 필요한 값 수정 (아래 환경 변수 섹션 참조)

# 3. 의존성 설치
bun install

# 4. 데이터베이스 시작
docker compose up -d

# 5. DB 마이그레이션 적용
bun run db:migrate

# 6. API 서버 시작
bun run dev
```

API 서버가 `http://localhost:3000`에서 실행됩니다.
헬스 체크: `GET /api/v1/health`

---

## 환경 변수

`.env.example`을 복사하여 `.env`를 만들고 값을 채웁니다.

```bash
# Database
DATABASE_URL=postgres://combine:combine@localhost:5432/combine_trade
DATABASE_URL_TEST=postgres://combine:combine@localhost:5432/combine_trade_test

# API Server
PORT=3000
NODE_ENV=development

# JWT
JWT_SECRET=change-me-in-production
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# 거래소 API 키 암호화용 마스터 키 (AES-256-GCM)
# 거래소 API 키(Binance 등)는 .env에 넣지 않습니다.
# 유저가 API를 통해 등록하면 이 키로 암호화하여 exchange_credentials 테이블에 유저별로 저장됩니다.
MASTER_ENCRYPTION_KEY=change-me-in-production-64-hex-chars

# Logging
LOG_LEVEL=info
```

> **주의**: `JWT_SECRET`과 `MASTER_ENCRYPTION_KEY`는 운영 환경에서 반드시 강력한 랜덤 값으로 변경하세요.
> `MASTER_ENCRYPTION_KEY`는 64자리 hex 문자열 (256-bit)이어야 합니다.
>
> 생성 예: `openssl rand -hex 32`
>
> **거래소 API 키 등록**: 서버 실행 후 아래 API로 유저별로 등록합니다.
> ```bash
> curl -X POST http://localhost:3000/api/v1/credentials \
>   -H "Authorization: Bearer <token>" \
>   -H "Content-Type: application/json" \
>   -d '{"exchange": "binance", "apiKey": "...", "secret": "..."}'
> ```

---

## 개발 명령어

```bash
bun install          # 의존성 설치
bun run dev          # API 서버 개발 모드 (hot reload)
bun test             # 전체 테스트 실행
bun run lint         # 코드 린트 (Biome)
bun run typecheck    # 타입 체크 (tsc --noEmit)
bun run build        # 빌드 (typecheck)
bun run db:generate  # DrizzleORM 마이그레이션 생성
bun run db:migrate   # 마이그레이션 적용
```

### 테스트

```bash
# 전체 테스트
bun test

# 특정 파일/패키지만
bun test packages/core/strategy
bun test packages/core/vector

# 통합 테스트
bun test tests/integration
```

---

## 워커 실행

워커는 독립 프로세스로 실행됩니다. 개발/운영 시 수퍼바이저로 한번에 시작합니다.

### 수퍼바이저로 전체 시작 (권장)

```bash
bun run scripts/supervisor.ts
```

수퍼바이저가 모든 워커를 시작하고, 크래시 발생 시 자동 재시작합니다 (최대 5회, exponential backoff).

### 개별 워커 실행

```bash
# 캔들 수집기 (거래소 WebSocket → DB)
bun run workers/candle-collector/src/index.ts

# 전략 평가 워커 (캔들 close → 이벤트 감지)
bun run workers/strategy-worker/src/index.ts

# 벡터 워커 (이벤트 → 벡터화 → 유사 검색 → 의사결정)
bun run workers/vector-worker/src/index.ts

# 레이블 워커 (이벤트 결과 추적: WIN/LOSS/TIME_EXIT)
bun run workers/label-worker/src/index.ts

# 알람 워커 (Slack 알람 발송)
bun run workers/alert-worker/src/index.ts

# 실행 워커 (주문 실행)
bun run workers/execution-worker/src/index.ts

# 저널 워커 (트레이드 저널 생성)
bun run workers/journal-worker/src/index.ts

# 거시경제 수집기
bun run workers/macro-collector/src/index.ts
```

### 워커 간 통신

워커는 **PostgreSQL LISTEN/NOTIFY**를 통해 통신합니다 (메시지 브로커 별도 불필요).

| 채널 | 발행자 | 구독자 |
|------|--------|--------|
| `candle_closed` | candle-collector | strategy-worker |
| `strategy_event_created` | strategy-worker | vector-worker |
| `decision_completed` | vector-worker | alert-worker, execution-worker |
| `label_ready` | label-worker | journal-worker |

---

## 백필 방법

### 방법 1: Binance Vision CSV 파일 사용 (권장, 대용량)

Binance Vision에서 과거 캔들 데이터를 다운로드하여 DB에 적재합니다.

```bash
# 1. Binance Vision에서 CSV 다운로드
# https://data.binance.vision/ → Futures → UM → monthly/klines/{SYMBOL}/{INTERVAL}/
# 예: BTCUSDT-1h-2023-01.zip ~ BTCUSDT-1h-2025-12.zip

# 2. CSV 파일 파싱 후 DB 적재
# packages/backtest/csv-parser.ts 사용
bun run packages/backtest/src/csv-parser.ts \
  --exchange binance \
  --symbol BTCUSDT \
  --timeframe 1h \
  --file ./data/BTCUSDT-1h-2023-01.csv
```

### 방법 2: REST API 백필 (소규모)

거래소 REST API를 통해 과거 데이터를 수집합니다. 요청 수 제한으로 대용량에는 적합하지 않습니다.

```bash
# API 서버를 통한 백필 요청
curl -X POST http://localhost:3000/api/v1/candles/backfill \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "exchange": "binance",
    "symbol": "BTCUSDT",
    "timeframe": "1h",
    "from": "2022-01-01T00:00:00Z",
    "to": "2025-01-01T00:00:00Z"
  }'
```

### 방법 3: 갭 자동 복구

candle-collector 워커가 실행 중일 때, 연속성 검사에서 갭이 감지되면 자동으로 REST API 백필을 수행합니다.

```
candle_closed 이벤트 수신
→ 연속성 검증 (이전 캔들 open_time + interval == 현재 open_time)
→ 갭 감지 시 GapRepairService 자동 실행
→ REST API로 누락 구간 보충
```

### 백필 완료 확인

```sql
-- 캔들 수 및 커버리지 확인
SELECT exchange, symbol, timeframe,
       COUNT(*) AS candle_count,
       MIN(open_time) AS earliest,
       MAX(open_time) AS latest
FROM candles
WHERE symbol = 'BTCUSDT' AND timeframe = '1h'
GROUP BY exchange, symbol, timeframe;
```

---

## 백테스트 실행

백테스트는 DB에 저장된 과거 캔들로 전략을 시뮬레이션하고 벡터·레이블·성과 리포트를 생성합니다.

### API를 통한 백테스트

```bash
# 백테스트 실행 (전략이 DB에 등록되어 있어야 함)
curl -X POST http://localhost:3000/api/v1/backtest \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "strategyId": "<strategy-id>",
    "symbol": "BTCUSDT",
    "timeframe": "1h",
    "from": "2022-01-01T00:00:00Z",
    "to": "2025-01-01T00:00:00Z",
    "initialBalance": 10000
  }'
```

### 백테스트 결과

응답에 포함되는 주요 지표:

| 지표 | 설명 |
|------|------|
| `totalTrades` | 총 거래 수 |
| `winRate` | 승률 (%) |
| `expectancy` | 기대수익 |
| `sharpeRatio` | 샤프 지수 (연환산, √365) |
| `maxDrawdown` | 최대 낙폭 (%) |
| `confidenceTierBreakdown` | 신뢰도 구간별 성과 분석 |

### 백테스트 후 벡터 활용

백테스트 중 생성된 벡터는 실시간 운영에서 바로 사용됩니다. 새 버전을 배포할 때는:

```
1. 전략 코드 수정 → 버전 증가
2. 새 벡터 테이블 자동 생성 (vectors_{strategy_id}_v{version})
3. 백테스트 재실행 → 새 벡터 축적
4. 실시간 운영 시작 → 새 벡터 테이블 사용
```

---

## 전략 작성 가이드

전략은 TypeScript로 작성하여 API를 통해 DB에 저장됩니다.

### 전략 구조

```typescript
// 전략 설정 (API로 등록 시 전달)
{
  name: "My RSI Strategy",
  symbols: ["BTCUSDT"],
  timeframe: "1h",
  direction: "LONG",          // "LONG" | "SHORT"

  // 이벤트 조건: true를 반환하면 이벤트 발생
  eventCondition: `
    const rsi = indicators.rsi(candles.close, 14);
    const current = rsi[rsi.length - 1];
    return current < 30;      // RSI 과매도 조건
  `,

  // 피처 벡터 정의 (벡터화 입력)
  features: [
    { name: "rsi", normalize: "ratio" },           // /100
    { name: "volumeRatio", normalize: "percentile" }, // rolling percentile
    { name: "bbPosition", normalize: "minmax" },
  ],

  // 결과 판정 설정
  tpPct: 2.0,          // TP: +2%
  slPct: 1.0,          // SL: -1%
  maxHoldBars: 48,     // 최대 보유 캔들 수

  // 의사결정 설정 (기본값)
  minWinrate: 0.55,
  minExpectancy: 0,
  minSamples: 30,
  topK: 50,
}
```

### 샌드박스 API (전략 코드에서 사용 가능)

```typescript
// 캔들 데이터 (현재 타임프레임)
candles.open[]    candles.high[]    candles.low[]
candles.close[]   candles.volume[]

// 기술지표
indicators.sma(prices, period)
indicators.ema(prices, period)
indicators.rsi(prices, period)
indicators.macd(prices, fast, slow, signal)
indicators.bollinger(prices, period, stdDev)
indicators.atr(high, low, close, period)
indicators.stochastic(high, low, close, kPeriod, dPeriod)

// 멀티 타임프레임 (예: 1h 전략에서 4h 캔들 참조)
const htf = await context.getCandles("4h", 100);
```

### 전략 등록

```bash
curl -X POST http://localhost:3000/api/v1/strategies \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{ ...전략 설정... }'
```

---

## 실행 모드

전략별로 실행 모드를 설정합니다. DB의 `strategies.execution_mode` 컬럼으로 관리됩니다.

| 모드 | 동작 |
|------|------|
| `analysis` | 데이터 수집·이벤트 감지·패턴 분석만. 알람·주문 없음. |
| `alert` | analysis + Slack 알람 발송. |
| `paper` | 실시간 데이터 + 가상 체결. 실제 자금 없이 검증. |
| `live` | 실제 거래소 주문 실행 (readiness score ≥ 70 필요). |

### Paper → Live 전환 조건 (readiness score)

```
Readiness Score (100점 만점, ≥ 70 필요)
  ├── 백테스트 검증 (35점)
  │   ├── 거래 수 ≥ 100           (+10)
  │   ├── 기대수익 > 0             (+10)
  │   ├── 샤프 지수 > 1.0          (+10)
  │   └── 최대 낙폭 < 20%          (+5)
  ├── 모의매매 검증 (35점)
  │   ├── 기간 ≥ 7일               (+8)
  │   ├── 거래 수 ≥ 10             (+7)
  │   ├── 승률 z-test 통과 (p<0.05) (+12)
  │   └── 손실 한도 위반 0회        (+8)
  ├── 리스크 설정 (20점)
  │   ├── 일일 손실 한도 설정        (+5)
  │   ├── 포지션 사이징 설정         (+5)
  │   ├── 킬스위치 테스트 완료        (+5)
  │   └── 거래소 자격증명 유효        (+5)
  └── 수동 확인 (10점)
      ├── 리스크 동의 체크박스        (+5)
      └── "go live" 텍스트 입력      (+5)
```

---

## API 엔드포인트

기본 URL: `http://localhost:3000`

인증이 필요한 엔드포인트는 `Authorization: Bearer <token>` 헤더를 포함합니다.

### 인증

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `POST` | `/api/v1/auth/login` | 로그인 (JWT 발급) |
| `POST` | `/api/v1/auth/refresh` | 토큰 갱신 |

### 전략

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `GET` | `/api/v1/strategies` | 전략 목록 |
| `POST` | `/api/v1/strategies` | 전략 생성 |
| `GET` | `/api/v1/strategies/:id` | 전략 상세 |
| `PUT` | `/api/v1/strategies/:id` | 전략 수정 |
| `DELETE` | `/api/v1/strategies/:id` | 전략 삭제 |

### 캔들

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `GET` | `/api/v1/candles` | 캔들 조회 |
| `POST` | `/api/v1/candles/backfill` | 과거 데이터 백필 |

### 이벤트 & 의사결정

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `GET` | `/api/v1/events` | 전략 이벤트 목록 |
| `GET` | `/api/v1/events/:id` | 이벤트 상세 (벡터·레이블 포함) |

### 백테스트

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `POST` | `/api/v1/backtest` | 백테스트 실행 |

### 주문 & 알람

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `GET` | `/api/v1/orders` | 주문 목록 |
| `GET` | `/api/v1/alerts` | 알람 목록 |

### 리스크 관리

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `POST` | `/api/v1/kill-switch/activate` | 킬스위치 활성화 |
| `POST` | `/api/v1/kill-switch/deactivate` | 킬스위치 비활성화 |
| `GET` | `/api/v1/kill-switch/status` | 킬스위치 상태 |

### 실시간 스트림 (SSE)

| 경로 | 설명 |
|------|------|
| `GET /api/v1/sse` | 실시간 이벤트 스트림 (의사결정·알람·워커 상태) |

---

## 데이터베이스

### 컨테이너 관리

```bash
# 시작
docker compose up -d

# 중지
docker compose down

# 데이터 포함 완전 삭제
docker compose down -v

# PostgreSQL 직접 접속
docker exec -it combine-trade-db psql -U combine -d combine_trade
```

### 마이그레이션

```bash
# 스키마 변경 후 마이그레이션 파일 생성
bun run db:generate

# 마이그레이션 적용
bun run db:migrate
```

### 연결 정보 (기본값)

| 항목 | 값 |
|------|-----|
| Host | `localhost:5432` |
| Database | `combine_trade` |
| User | `combine` |
| Password | `combine` |
| Max connections | 30 |

---

## 아키텍처 제약사항

- **벡터 격리**: 벡터 검색은 동일 전략 + 동일 버전 + 동일 심볼 내에서만 수행 (교차 금지)
- **전략 샌드박스**: V8 isolates 사용. DB·네트워크·파일시스템 직접 접근 불가. 메모리 128MB, 타임아웃 500ms
- **레이턴시 예산**: 캔들 close → 의사결정 < 1초
- **금융 연산**: 가격·PnL·수수료·잔고는 모두 Decimal.js 사용 (native float 금지)
- **킬스위치**: 1초 이내 전체 트레이딩 중단 보장
- **주문 안전성**: 모든 주문은 반드시 decision_id를 포함해야 함 (직접 주문 API 호출 금지)
