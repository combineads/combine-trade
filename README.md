# combine-trade

김직선 Double-BB 전략 기반 자동 암호화폐 선물 트레이딩 시스템.
KNN 통계 검증을 통해 다수 거래소에서 자동 매매를 수행합니다.

## 핵심 특징

- **Double-BB 전략**: BB20(20,2) + BB4(4,4) 이중 볼린저밴드 기반 진입 신호
- **KNN 의사결정**: 202차원 벡터화 + pgvector KNN으로 과거 유사 패턴 통계 검증
- **다중 거래소**: Binance, OKX, Bitget, MEXC (CCXT 기반)
- **다중 타임프레임**: 1D/1H/5M/1M 캔들 수집 (WebSocket + REST)
- **3단계 청산**: TP1 → TP2 → Trailing Stop
- **안전 장치**: SL 거래소 등록 필수, 60초 주기 Reconciliation, 손실 제한, Kill Switch
- **경제 캘린더**: 고위험 거시경제 이벤트 감지 시 자동 거래 차단 (24시간 블록)
- **백테스트**: Walk-Forward Optimization (WFO) 지원, 라이브와 동일 코드 경로
- **실시간 알림**: Slack Webhook 연동
- **자동 이체**: 선물 → 현물 수익 자동 이체

## 요구사항

| 항목 | 버전 |
|------|------|
| [Bun](https://bun.sh) | 1.3.11+ |
| [PostgreSQL](https://www.postgresql.org) | 18+ |
| [pgvector](https://github.com/pgvector/pgvector) | 0.2.1+ |
| Docker (선택) | 테스트 DB용 |

## 빠른 시작

### 1. 저장소 클론 및 의존성 설치

```bash
git clone <repository-url> combine-trade
cd combine-trade
bun install
```

### 2. 환경 변수 설정

```bash
cp .env.example .env
```

`.env` 파일을 열어 아래 항목을 설정합니다:

```bash
# 데이터베이스
DATABASE_URL=postgresql://user:pass@localhost:5432/combine_trade

# 거래소 API 키 (사용할 거래소만 설정)
BINANCE_API_KEY=your_key
BINANCE_API_SECRET=your_secret

# 인증
JWT_SECRET=64자_이상의_랜덤_문자열

# 알림
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/your/webhook/url

# 로깅
LOG_LEVEL=info
```

> **주의**: `.env` 파일은 절대 커밋하지 마세요. `.gitignore`에 등록되어 있습니다.

### 3. 데이터베이스 준비

**옵션 A: Docker (테스트/개발용)**

```bash
docker compose up -d
```

pgvector가 포함된 PostgreSQL 18이 포트 5433에 실행됩니다.

**옵션 B: 로컬 PostgreSQL**

```bash
# PostgreSQL 18에 pgvector 확장 설치
# macOS: brew install pgvector
# Ubuntu: apt install postgresql-18-pgvector

# DB 생성
createdb combine_trade

# pgvector 확장 활성화
psql combine_trade -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

### 4. 마이그레이션 및 초기 데이터

```bash
# 스키마 마이그레이션
bun run migrate

# 설정 데이터 시드 (거래소, 타임프레임, 전략 파라미터 등)
bun run seed
```

### 5. 실행

```bash
# 개발 모드 (파일 변경 시 자동 재시작)
bun run dev

# 프로덕션 모드
bun run daemon
```

## 주요 명령어

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

## 프로젝트 구조

```
src/
├── core/           # [L0] 타입, 상수, Decimal, 포트 인터페이스
├── db/             # [L1] DB 연결, 마이그레이션, 쿼리
├── config/         # [L1] 설정 스키마, 로더
├── indicators/     # [L2] BB20, BB4, MA, RSI, ATR
├── exchanges/      # [L2] 거래소 어댑터 (Binance, OKX, Bitget, MEXC)
├── candles/        # [L3] WebSocket 캔들 수집, 갭 복구
├── vectors/        # [L3] 202차원 벡터화, 정규화
├── filters/        # [L4] 방향 필터, 거래 차단, 경제 캘린더
├── knn/            # [L4] KNN 엔진, 시간 감쇠
├── signals/        # [L5] WATCHING, Evidence Gate, Safety Gate
├── positions/      # [L5] 포지션 FSM, 사이징
├── limits/         # [L5] 손실 제한 (일일/세션/시간)
├── orders/         # [L6] 주문 실행기
├── exits/          # [L6] 3단계 청산 (TP1/TP2/Trailing)
├── labeling/       # [L6] 거래 결과 분류
├── reconciliation/ # [L7] 60초 주기 DB↔거래소 동기화
├── notifications/  # [L7] Slack 알림
├── transfer/       # [L7] 선물→현물 자동 이체
├── api/            # [L8] REST API (Hono)
├── backtest/       # [L8] 백테스트, WFO
├── daemon/         # [L9] 데몬 오케스트레이션
└── web/            # React UI (Vite + Tailwind)
```

레이어 규칙: N번 레이어는 0~(N-1)번만 임포트 가능. `bun run check-layers`로 검증.

## 거래소 API 키 설정

각 거래소에서 API 키를 발급받을 때 아래 규칙을 준수하세요:

- **선물 거래 권한만** 부여 (출금 권한 절대 금지)
- 가능하면 **IP 화이트리스트** 설정
- 거래소별 별도 API 키 사용

```bash
# .env에 사용할 거래소만 설정
BINANCE_API_KEY=...
BINANCE_API_SECRET=...

OKX_API_KEY=...
OKX_API_SECRET=...

BITGET_API_KEY=...
BITGET_API_SECRET=...

MEXC_API_KEY=...
MEXC_API_SECRET=...
```

## 배포 단계

시스템은 4단계를 거쳐 점진적으로 배포합니다:

1. **백테스트 검증** — 과거 데이터로 전략 유효성 확인
2. **분석 모드** — 2주 이상, 30만원, 신호만 발생 (주문 실행 안 함)
3. **알림 모드** — 2주 이상, 10건 이상 완료 거래 확인
4. **라이브 운영** — 3천만원 한도, risk_pct 1%

## 문서

| 문서 | 내용 |
|------|------|
| [PRODUCT.md](docs/PRODUCT.md) | 제품 요구사항, 성공 지표 |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | 기술 아키텍처, 레이어 규칙 |
| [TECH_STACK.md](docs/TECH_STACK.md) | 기술 스택, 라이브러리 버전 |
| [DATA_MODEL.md](docs/DATA_MODEL.md) | 데이터 모델, 엔티티 관계 |
| [운영 매뉴얼](docs/manuals/) | **설치, 운영, 모니터링, 긴급 대응, 문제 해결** |
| [SECURITY.md](docs/SECURITY.md) | 보안 정책, 인증 |
| [RELIABILITY.md](docs/RELIABILITY.md) | 장애 모드, 복구 절차 |
| [QUALITY.md](docs/QUALITY.md) | 품질 기준, 테스트 전략 |

## 기술 스택

- **런타임**: Bun 1.3.11
- **언어**: TypeScript 6.0.2 (strict)
- **DB**: PostgreSQL 18 + pgvector
- **ORM**: Drizzle 0.45.2
- **웹 프레임워크**: Hono 4.12.10
- **거래소 API**: CCXT 4.5.46
- **정밀 연산**: Decimal.js 10.6.0
- **프론트엔드**: React 19 + Vite 8 + Tailwind CSS 4 + Zustand + TanStack Query
- **린터**: Biome 2.4.10

## 라이선스

Private — All rights reserved.
