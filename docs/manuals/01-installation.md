# 설치 가이드

## 1.1 사전 요구사항

| 항목 | 최소 버전 | 설치 방법 |
|------|----------|----------|
| [Bun](https://bun.sh) | 1.3.11 | `curl -fsSL https://bun.sh/install \| bash` |
| [PostgreSQL](https://www.postgresql.org) | 18 | `brew install postgresql@18` (macOS) |
| [pgvector](https://github.com/pgvector/pgvector) | 0.2.1 | `brew install pgvector` (macOS) |
| Docker (선택) | 최신 | 테스트 DB 실행 시 필요 |

## 1.2 프로젝트 설치

```bash
git clone <repository-url> combine-trade
cd combine-trade
bun install
```

## 1.3 환경 변수 설정

```bash
cp .env.example .env
```

`.env` 파일을 열어 아래 항목을 설정합니다.

### 필수 환경 변수

| 변수 | 설명 | 예시 |
|------|------|------|
| `DATABASE_URL` | PostgreSQL 연결 문자열 | `postgresql://user:pass@localhost:5432/combine_trade` |
| `JWT_SECRET` | 웹 UI 인증 토큰 비밀키 (64자 이상) | `openssl rand -hex 32` 로 생성 |
| `LOG_LEVEL` | 로그 레벨 | `info` (기본), `debug`, `warn`, `error` |

### 거래소 API 키 (사용할 거래소만 설정)

| 변수 | 거래소 |
|------|--------|
| `BINANCE_API_KEY` / `BINANCE_API_SECRET` | Binance |
| `OKX_API_KEY` / `OKX_API_SECRET` | OKX |
| `BITGET_API_KEY` / `BITGET_API_SECRET` | Bitget |
| `MEXC_API_KEY` / `MEXC_API_SECRET` | MEXC |

### 선택 환경 변수

| 변수 | 설명 |
|------|------|
| `SLACK_WEBHOOK_URL` | Slack 알림 웹훅 URL |

> **보안 주의사항:**
>
> - `.env` 파일은 절대 Git에 커밋하지 마세요
> - 거래소 API 키는 **선물 거래 권한만** 부여하세요
> - **출금 권한은 절대 부여하지 마세요**
> - 가능하면 거래소에서 IP 화이트리스트를 설정하세요

## 1.4 데이터베이스 초기화

### 방법 A: Docker (개발/테스트)

```bash
# pgvector 포함 PostgreSQL 18 실행 (포트 5433)
docker compose up -d

# 컨테이너 상태 확인
docker compose ps
```

Docker 사용 시 `.env`의 DATABASE_URL을 맞게 설정합니다:

```bash
DATABASE_URL=postgresql://test:test@localhost:5433/combine_trade_test
```

### 방법 B: 로컬 PostgreSQL (프로덕션)

```bash
# DB 생성
createdb combine_trade

# pgvector 확장 활성화
psql combine_trade -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

### 마이그레이션 및 시드

```bash
# 스키마 마이그레이션 실행
bun run migrate

# 초기 설정 데이터 투입
bun run seed
```

시드 데이터에는 12개 설정 그룹의 기본값이 포함됩니다:

- 거래소 설정 (Binance, OKX, Bitget, MEXC)
- 타임프레임 (1D, 1H, 5M, 1M)
- 심볼 설정 (BTCUSDT, XAUTUSDT — risk_pct 3%, max_leverage 38x)
- KNN 파라미터 (top_k 50, min_samples 30)
- 포지션 파라미터 (기본 레버리지 20x, 피라미딩 2회)
- 손실 제한 (일일 10%, 세션 3연속, 1시간 5분봉 2회, 1시간 1분봉 1회)
- 구조적 앵커 (BB20, BB4, MA 기간 — **변경 금지**)
- 이체 설정 (기본 비활성)

설정 상세는 [설정 관리](./07-configuration.md) 매뉴얼을 참고하세요.

## 1.5 최초 배포 체크리스트

```bash
# 전체 검증 명령
bun test              # 테스트 통과 확인
bun run lint          # 코드 품질 확인
bun run typecheck     # 타입 안전성 확인
bun run check-layers  # 레이어 의존성 검증
```

- [ ] Bun 1.3.11+ 설치
- [ ] PostgreSQL 18 + pgvector 설치
- [ ] `.env` 파일 설정 완료
- [ ] DB 생성 및 pgvector 확장 활성화
- [ ] `bun run migrate` 성공
- [ ] `bun run seed` 성공
- [ ] `bun test` 전체 통과
- [ ] 거래소 API 키 설정 (선물 거래 권한만, 출금 권한 없음)
- [ ] Slack 웹훅 연동 확인
- [ ] `analysis` 모드에서 데몬 시작 확인
- [ ] Slack 알림 수신 확인
