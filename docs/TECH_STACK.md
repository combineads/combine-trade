# TECH_STACK.md

기술 선택 이유, 사용 규칙, 주요 설정을 담은 레퍼런스 문서.
아키텍처 경계 규칙은 [ARCHITECTURE.md](./ARCHITECTURE.md), 품질 기준은 [QUALITY.md](./QUALITY.md) 참조.

---

## 라이브러리 목록

새 패키지를 추가할 때는 이 표를 먼저 확인하고 업데이트한다.

### Runtime & 공통

| 패키지 | 용도 | 위치 |
|--------|------|------|
| `typescript` | 언어 | 전체 |
| `zod` | 런타임 스키마 검증 (API 입력, 전략 설정, 환경변수) | `packages/shared/`, `apps/api/` |
| `decimal.js` | 재무 정밀 연산 (PnL, 수수료, 잔고) | `packages/shared/decimal/` |
| `date-fns` | 날짜/시간 유틸리티 | `packages/shared/` |
| `pino` | 구조화 JSON 로거 (24/7 운영 로깅) | `packages/shared/logger/` |
| `pino-pretty` | 개발 환경 로그 포매팅 (dev only) | `packages/shared/logger/` |
| `lru-cache` | 인메모리 캐시 (거래소 메타데이터, 전략 설정) | `packages/shared/cache/` |

### API 서버 (`apps/api/`)

| 패키지 | 용도 |
|--------|------|
| `elysia` | REST API 프레임워크 |
| `@elysiajs/eden` | 타입-세이프 Eden treaty 클라이언트 |
| `@elysiajs/jwt` | JWT 미들웨어 |
| `@elysiajs/cors` | CORS 플러그인 |
| `@elysiajs/helmet` | 보안 헤더 (CSP, HSTS 등) |
| `better-auth` | 인증 (세션, 소셜 로그인 확장 가능) |

### 공통 UI (`packages/ui/`)

| 패키지 | 용도 |
|--------|------|
| `react`, `react-dom` | UI 라이브러리 |
| `@tanstack/react-query` | 서버 상태 관리 (데이터 페칭, 캐싱, 재시도) |
| `@tanstack/react-table` | 데이터 테이블 (저널, 결정 이력, 전략 목록) |
| `@shadcn/ui` | UI 컴포넌트 (Tailwind CSS 기반) |
| `tailwindcss` | 유틸리티 CSS |
| `lightweight-charts` | TradingView 캔들스틱 차트 |
| `@monaco-editor/react` | 전략 코드 에디터 |
| `react-hook-form` | 폼 상태 관리 |
| `zustand` | 클라이언트 상태 관리 |

### Web UI (`apps/web/`)

| 패키지 | 용도 |
|--------|------|
| `next` | 웹 프레임워크 (SSR/SSG) |
| `@elysiajs/eden` | 타입-세이프 Eden treaty 클라이언트 |
| `packages/ui` | 공통 컴포넌트 (workspace import) |

### Desktop (`apps/desktop/`)

| 패키지 | 용도 |
|--------|------|
| `next` | 프레임워크 (`output: 'export'` 정적 빌드) |
| `@tauri-apps/api` | Tauri JS 브릿지 (알림, keychain 등) |
| `@tauri-apps/plugin-store` | 플랫폼 Keychain 토큰 저장 |
| `@tauri-apps/plugin-notification` | 네이티브 OS 알림 |
| `packages/ui` | 공통 컴포넌트 (workspace import) |

### 데이터베이스 (`packages/shared/`, `db/`)

| 패키지 | 용도 |
|--------|------|
| `drizzle-orm` | ORM (스키마 정의, 쿼리) |
| `drizzle-kit` | 마이그레이션 생성/적용 CLI |
| `postgres` | PostgreSQL 드라이버 (Bun 호환) |

### 도메인 패키지

| 패키지 | 용도 | 위치 |
|--------|------|------|
| `@ixjb94/indicators` | 기술 지표 (SMA/EMA/BB/RSI/MACD/ATR 등) | `packages/core/indicator/` |
| `ccxt` | 거래소 어댑터 (Binance, OKX) | `packages/exchange/` |
| `argon2` | 패스워드 해싱 (Argon2id) | `apps/api/` |
| `p-retry` | 거래소 API 호출 지수 백오프 재시도 | `packages/exchange/` |
| `croner` | 크론 스케줄러 (label-worker 폴링, 백업, 펀딩비 수집) | `workers/` |

### 테스트 & 개발 도구

| 패키지 | 용도 |
|--------|------|
| `@biomejs/biome` | 린팅 + 포매팅 (ESLint + Prettier 대체) |
| `@faker-js/faker` | 테스트 픽스처 데이터 생성 |
| `bun:test` | 테스트 러너 (별도 설치 불필요, Bun 내장) |
| `playwright` | Web UI E2E 테스트 — Chromium/WebKit/Firefox 브라우저 자동화 |
| `@wdio/cli` | Desktop (Tauri) E2E — WebDriverIO 클라이언트 |
| `tauri-driver` | Tauri WebDriver 프록시 (Linux: webkit2gtk-driver, Windows: msedgedriver) |
| `tauri-webdriver` | Tauri 내장 WebDriver 플러그인 — macOS 포함 크로스 플랫폼 (community) |
| `@tauri-apps/api/mocks` | Tauri IPC 프론트엔드 Mock (mockIPC, mockWindows) |

> **추가 원칙**: 패키지 추가 전 동일 기능이 기존 라이브러리로 해결 가능한지 확인. 새 패키지 추가 시 이 표에 반드시 등록.

---

## 목차

1. [Runtime](#1-runtime)
2. [API 프레임워크](#2-api-프레임워크)
3. [Web UI](#3-web-ui)
4. [Desktop / Mobile](#4-desktop--mobile)
5. [데이터베이스 & ORM](#5-데이터베이스--orm)
6. [벡터 검색 (pgvector)](#6-벡터-검색-pgvector)
7. [이벤트 버스](#7-이벤트-버스)
8. [의존성 주입 & AOP](#8-의존성-주입--aop)
9. [거래소 어댑터](#9-거래소-어댑터)
10. [재무 연산 정밀도](#10-재무-연산-정밀도)
11. [인증 & 보안](#11-인증--보안)
12. [실시간 스트리밍](#12-실시간-스트리밍)
13. [차트 & 시각화](#13-차트--시각화)
14. [린팅 & 포매팅](#14-린팅--포매팅)
15. [CI/CD & 배포](#15-cicd--배포)
16. [로깅 & 관측성](#16-로깅--관측성)

---

## 1. Runtime

### Bun

| 항목 | 내용 |
|------|------|
| 역할 | 전체 런타임, 패키지 매니저, 테스트 러너 |
| 선택 이유 | 네이티브 TypeScript, 빠른 빌드/테스트, Bun workspace 모노레포 지원 |
| 모노레포 | 루트 `package.json` → `workspaces: ["apps/*", "packages/*", "workers/*"]` |
| 테스트 | `bun test` (별도 Jest 불필요) |
| CLI 스크립트 | 모든 스크립트는 `bun run scripts/*.ts` (Node.js CLI 사용 금지) |

### TypeScript

- `strict: true`, project references (`tsconfig.json`)
- `bun run typecheck` → `tsc --noEmit` 로 검증
- 전략 샌드박스, 도메인 코드, API 모두 TypeScript 단일 언어

---

## 2. API 프레임워크

### Elysia

| 항목 | 내용 |
|------|------|
| 역할 | REST API 서버 (`apps/api/`) |
| 선택 이유 | Bun 네이티브, 타입-세이프 라우트/스키마, 플러그인 생태계 |
| 클라이언트 | Eden treaty — 타입-세이프 API 호출 (`apps/web/`, `apps/desktop/`) |
| 미들웨어 | AOP 기반 (로깅, 에러 핸들링, JWT 인증) |
| SSE | 실시간 푸시 (`/api/v1/stream/*`) |
| 버전 | URL 프리픽스 방식 `/api/v1/...` |

**공개 엔드포인트 (JWT 불필요)**
```
GET  /api/v1/health
POST /api/v1/auth/login
POST /api/v1/auth/refresh
```

---

## 3. Web UI

### Next.js (`apps/web/`)

| 항목 | 내용 |
|------|------|
| 역할 | 웹 대시보드 (SSR 지원) |
| 렌더링 | SSR/SSG 혼합 — Server Components로 초기 데이터 프리페치 |
| API 통신 | Elysia Eden treaty |
| 서버 상태 | `@tanstack/react-query` (클라이언트 사이드 데이터 페칭, 캐싱, 재시도) |
| 클라이언트 상태 | `zustand` (JWT access token, UI state) |
| 전략 에디터 | Monaco Editor + Strategy API 타입 힌트 (EP08-M5) |
| 실시간 | SSE → react-query invalidation |
| UI 컴포넌트 | `packages/ui/` 에서 import |

**SSR 활용 범위**:
- Server Components: 대시보드 초기 데이터, 전략 목록 등 프리페치 (빠른 첫 화면)
- 클라이언트 hydration 후 react-query가 실시간 갱신 담당
- API Routes / Server Actions는 사용하지 않음 (Elysia API 서버가 별도 존재)

---

## 4. Desktop / Mobile

### Tauri + Next.js Static (`apps/desktop/`)

| 항목 | 내용 |
|------|------|
| 역할 | 데스크탑/모바일 앱 |
| 프론트엔드 | **별도 Next.js 앱** (`output: 'export'` 정적 빌드) |
| WebView | macOS: WKWebView (WebKit), Windows: WebView2 (Chromium), Linux: WebKitGTK |
| 네이티브 기능 | 시스템 트레이, 네이티브 알림, 자동 시작 |
| 토큰 저장 | 플랫폼 Keychain (macOS) / Credential Manager (Windows) |
| UI 컴포넌트 | `packages/ui/` 에서 import (`apps/web/`과 동일 컴포넌트) |
| PoC | EP08-M0에서 CSP 제약, Monaco 성능, WebView 렌더링 검증 |

**`apps/desktop/`은 두 부분으로 구성:**
1. `apps/desktop/app/` — Next.js App Router 페이지 (`output: 'export'`, 모두 `'use client'`)
2. `apps/desktop/src-tauri/` — Rust 코드 (Tauri 커맨드, 시스템 트레이, 키체인 등)

**apps/web/ vs apps/desktop/ 차이:**

| | `apps/web/` | `apps/desktop/` |
|---|---|---|
| 렌더링 | SSR/SSG | Static Export (`output: 'export'`) |
| 데이터 페칭 | Server Components + react-query | react-query only (전부 클라이언트) |
| 알림 | Web Notification API | Tauri 네이티브 알림 |
| 토큰 | httpOnly 쿠키 | Keychain + httpOnly 쿠키 |
| 라우트 가드 | Middleware (서버) | 클라이언트 사이드 가드 |
| 페이지 코드 | 얇은 래퍼 (Server Component → `<XxxView />`) | 얇은 래퍼 (`'use client'` → `<XxxView />`) |

**tauri.conf.json 핵심 설정**:
```jsonc
{
  "build": {
    "devUrl": "http://localhost:3001",           // dev: desktop Next.js dev server (포트 분리)
    "frontendDist": "./out",                     // build: 자체 정적 export
    "beforeDevCommand": "bun dev",
    "beforeBuildCommand": "bun run build"
  },
  "app": {
    "security": {
      "csp": "default-src 'self'; script-src 'self' 'unsafe-eval'; ..."
      // unsafe-eval: Monaco Editor 내부 동작에 필요. 전략 코드 실행은 V8 isolate(서버)에서 수행.
    }
  }
}
```

**Dev/Build 워크플로**:
```bash
# Dev — desktop Next.js hot reload + Tauri WebView
cd apps/desktop && bun run tauri dev
# (apps/desktop 의 Next.js dev server :3001 → Tauri WebView 프록시)

# Build — 정적 export + Tauri 앱 패키징
cd apps/desktop && bun run tauri build
# (Next.js static export → out/ → Tauri 앱 번들링)
```

---

## 4.1 공유 UI 패키지

### `packages/ui/`

| 항목 | 내용 |
|------|------|
| 역할 | `apps/web/`과 `apps/desktop/` 공통 React 컴포넌트 라이브러리 |
| 소비자 | `apps/web/`, `apps/desktop/` |
| 스타일 | Tailwind CSS + Design System 토큰 (`docs/DESIGN_SYSTEM.md`) |
| 플랫폼 분기 | `usePlatform()` 훅 + 동적 import로 런타임 분기 |

**구조:**
```
packages/ui/
├── components/          # 공통 UI 컴포넌트 (Button, Card, Table, Chart, ...)
├── views/               # 페이지 뷰 컴포넌트 (DashboardView, StrategyListView, ...)
├── hooks/               # 공통 훅 (useSSE, useStrategy, ...)
├── platform/            # 플랫폼 어댑터
│   ├── types.ts         # PlatformAdapter 인터페이스
│   ├── context.tsx      # PlatformProvider (React Context)
│   ├── web.ts           # 웹 구현 (Web Notification, localStorage)
│   └── tauri.ts         # Tauri 구현 (네이티브 알림, Keychain) — dynamic import
└── index.ts
```

**페이지 뷰 패턴** — 앱 페이지는 얇은 래퍼, 실제 UI는 `packages/ui/views/`에:
```typescript
// packages/ui/views/DashboardView.tsx ('use client')
export function DashboardView() {
  const { data } = useQuery({ queryKey: ['pipeline-status'], queryFn: ... });
  return <div>...</div>;
}

// apps/web/app/dashboard/page.tsx (Server Component — SSR 프리페치 가능)
import { DashboardView } from '@combine/ui/views';
import { prefetchPipelineStatus } from '@/lib/prefetch';
export default async function Page() {
  await prefetchPipelineStatus();  // 선택적 SSR 프리페치
  return <DashboardView />;
}

// apps/desktop/app/dashboard/page.tsx ('use client' — 정적 빌드)
import { DashboardView } from '@combine/ui/views';
export default function Page() {
  return <DashboardView />;
}
```

**플랫폼 분기 패턴** — 컴포넌트 내부에서 런타임 감지:
```typescript
// packages/ui/platform/context.tsx
'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import type { PlatformAdapter } from './types';
import { webAdapter } from './web';

const PlatformContext = createContext<PlatformAdapter>(webAdapter);

export function PlatformProvider({ children }: { children: React.ReactNode }) {
  const [adapter, setAdapter] = useState<PlatformAdapter>(webAdapter);

  useEffect(() => {
    if ('__TAURI_INTERNALS__' in window) {
      import('./tauri').then(m => setAdapter(m.tauriAdapter));
    }
  }, []);

  return <PlatformContext.Provider value={adapter}>{children}</PlatformContext.Provider>;
}

export const usePlatform = () => useContext(PlatformContext);
```

```typescript
// packages/ui/components/NotificationButton.tsx
'use client';
import { usePlatform } from '../platform/context';

export function NotificationButton({ title, body }: Props) {
  const { sendNotification } = usePlatform();
  return <button onClick={() => sendNotification(title, body)}>Notify</button>;
}
```

**인증 흐름:**

| Token | 저장소 | Web | Tauri |
|-------|--------|-----|-------|
| Access (15분) | zustand (메모리) | 동일 | 동일 |
| Refresh (7일) | httpOnly 쿠키 | 동일 | 동일 (WebView 쿠키 jar) |
| Refresh 백업 | — | N/A | Keychain (`@tauri-apps/plugin-store`) |

**`@tauri-apps/api` 번들 격리:**
- `packages/ui/platform/tauri.ts`는 동적 import로만 로드
- `apps/web/` 빌드 시 tree-shaking으로 Tauri SDK가 웹 번들에 포함되지 않음
- `apps/desktop/` 빌드에서만 Tauri SDK가 번들에 포함

---

## 5. 데이터베이스 & ORM

### PostgreSQL

| 항목 | 내용 |
|------|------|
| 역할 | 메인 데이터 스토어 |
| 확장 | pgvector (벡터 검색), pg_trgm (선택) |
| 이벤트 버스 | LISTEN/NOTIFY (별도 외부 메시지 큐 불필요) |
| 동시성 | Advisory lock (`hash(symbol + direction)` 키), `SELECT … FOR UPDATE` |
| 백업 | pg_dump 매일 UTC 02:00, WAL 아카이빙 (RPO < 5분) |
| 연결 풀 총합 | 최대 30 (`max_connections = 30`) |

**워커별 연결 수**

| 워커 | 연결 수 |
|------|---------|
| candle-collector | 3 |
| strategy-worker | 3 |
| vector-worker | 5 |
| label-worker | 2 |
| alert-worker | 2 |
| execution-worker | 3 |
| journal-worker | 2 |
| API server | 5 |
| LISTEN 전용 | 3 |
| 헤드룸 | 2 |

### DrizzleORM

| 항목 | 내용 |
|------|------|
| 역할 | 타입-세이프 ORM, 마이그레이션 관리 |
| 선택 이유 | pgvector 지원, 마이그레이션 친화적, 타입 안전성 |
| 스키마 | `db/schema/` |
| 마이그레이션 | `bun run db:generate` → `bun run db:migrate` |
| 예외 | 동적 벡터 테이블(`vectors_{strategy_id}_v{version}`)은 raw SQL 사용 (DrizzleORM이 스키마-동적 테이블 미지원) |

**규칙**
- `apps/`, `workers/`만 `db/schema/` import 가능
- `packages/core/*`는 주입된 repository 인터페이스로 데이터 접근 (Drizzle 직접 import 금지)
- 트랜잭션은 `@Transactional` 데코레이터 전용 (수동 트랜잭션 관리 금지)

---

## 6. 벡터 검색 (pgvector)

### 인덱스: HNSW

| 파라미터 | 값 | 설명 |
|----------|----|------|
| 인덱스 타입 | HNSW | 실시간 검색 + 즉시 사용 가능 (IVFFlat 대비 우위) |
| 거리 메트릭 | L2 (Euclidean) | 코사인 아님 |
| `m` | 16 (기본) | 노드당 최대 연결 수 |
| `ef_construction` | 64 (기본) | 빌드 품질 |
| `ef_search` | 40 (기본) | 쿼리 품질 |
| recall@10 | > 95% | EP03-M2 벤치마크 기준 |

### 검색 파라미터

| 항목 | 값 |
|------|-----|
| top_k | 50 |
| similarity_threshold | √d × 0.3 (차원 비례) |
| min_samples | 30 |
| 검색 쿼리 | `ORDER BY embedding <-> query_vector LIMIT top_k` |
| 검색 타임아웃 | 2초 (초과 시 PASS + WARNING) |

### 격리 규칙

- 벡터 테이블: strategy당 1개 (`vectors_{strategy_id}_v{version}`)
- **동일 전략 + 동일 버전 + 동일 심볼** 내에서만 검색
- 교차-전략, 교차-심볼 검색 완전 금지 (물리적 테이블 분리로 강제)
- 전략 버전 변경 = 새 테이블 생성 + 재벡터화
- 배포당 최대 1,000개 동적 테이블

### 재인덱스 전략

- 백테스트 완료 후 대량 삽입 → `REINDEX INDEX CONCURRENTLY` 실행
- 일반 실시간 삽입: 자동 인덱스 업데이트

---

## 7. 이벤트 버스

### PostgreSQL LISTEN/NOTIFY

| 항목 | 내용 |
|------|------|
| 선택 이유 | 외부 의존성 없음, 단일 노드 MVP에 충분 |
| 신뢰성 | 연결 끊김 시 메시지 유실 가능 |
| 보완 | 60초 캐치업 폴링 (30초 이상 미처리 이벤트 DB 스캔) |
| 원칙 | NOTIFY는 시그널, 워커는 DB 상태를 재-읽기 (NOTIFY 페이로드만 믿지 않음) |
| 멱등성 | 모든 핸들러는 중복 수신 안전 보장 필수 |

**채널 정의**

| 채널 | 페이로드 | 프로듀서 | 컨슈머 |
|------|----------|----------|--------|
| `candle_closed` | exchange, symbol, timeframe, open_time | candle-collector | strategy-worker |
| `strategy_event_created` | event_id, strategy_id, symbol | strategy-worker | vector-worker |
| `decision_completed` | decision_id, event_id, direction | vector-worker | alert-worker, execution-worker |
| `label_ready` | event_id | label-worker | journal-worker |
| `kill_switch_activated` | strategy_id (nullable) | risk module | execution-worker |

---

## 8. 의존성 주입 & AOP

### IoC Container (`packages/shared/di/`)

- 모든 서비스는 컨테이너에 등록, 워커 시작 시 컨테이너에서 해결
- 수동 인스턴스화 금지
- 경계 강제: core → exchange/Elysia/Drizzle 직접 import 차단

### AOP Decorators (`packages/shared/aop/`)

| 데코레이터 | 역할 |
|-----------|------|
| `@Transactional` | DB 작업 트랜잭션 경계 (수동 TX 관리 금지) |
| `@Log` | 서비스 경계 구조화 로깅 |

---

## 9. 거래소 어댑터

### CCXT

| 항목 | 내용 |
|------|------|
| 역할 | 거래소 프로토콜 추상화 |
| 위치 | `packages/exchange/` (core로 유출 금지) |
| 지원 거래소 | Binance Futures (USDT-M), OKX |
| 포지션 모드 | Hedge mode 필수 (Binance: `dualSidePosition=true`, OKX: `posMode=long_short_mode`) |

**제공 인터페이스**

```typescript
fetchOHLCV(symbol, timeframe)       // REST 히스토리컬
watchOHLCV(symbol, timeframe)       // WebSocket 실시간
createOrder(symbol, type, side, amount, price)
cancelOrder(symbol, orderId)
fetchOrder(symbol, orderId)
fetchBalance()
fetchPositions()
fetchFundingRate()
```

**레이트 리밋**

| 거래소 | 한도 | 대응 |
|--------|------|------|
| Binance | 1,200 req/min | 토큰 버킷 / 슬라이딩 윈도우 |
| OKX | 60 req/2s | 자동 스로틀 |
| 공통 | 429 응답 시 지수 백오프 | |

**캔들 수집 전략 (3-tier backfill + real-time)**

| Tier | 소스 | 범위 | 속도 |
|------|------|------|------|
| 1. Binance Vision Monthly | ZIP 아카이브 (`data.binance.vision/.../monthly/`) | 전월까지 (당월 첫 월요일 게시) | 가장 빠름 (벌크 CSV) |
| 2. Binance Vision Daily | ZIP 아카이브 (`data.binance.vision/.../daily/`) | 당월 1일 ~ T-1일 (익일 게시) | 빠름 |
| 3. REST API | `fetchOHLCV()` | T-1 ~ now | 느림 (rate limited) |
| 4. WebSocket | `watchOHLCV()` | now → 실시간 | 스트리밍 |

- Tier 1-2 (Binance Vision): CSV 파싱 → bulk INSERT, NOTIFY 미발행, SHA256 CHECKSUM 검증
- Tier 3 (REST): 마지막 ~1일 갭 채움, NOTIFY 미발행 (백필)
- Tier 4 (WS): 실시간 수집 + `NOTIFY candle_closed`
- OKX: Binance Vision 없음 → Tier 3 (REST) + Tier 4 (WS) only
- WS 끊김 시 REST 복구 + 재구독 (지수 백오프)
- 1m 수집 후 상위 타임프레임 합산 (3m/5m/15m/1h 거래소에서 별도 수집 안 함)

**Binance Vision URL 패턴:**
```
Monthly: data.binance.vision/data/futures/um/monthly/klines/{SYMBOL}/{TF}/{SYMBOL}-{TF}-{YYYY}-{MM}.zip
Daily:   data.binance.vision/data/futures/um/daily/klines/{SYMBOL}/{TF}/{SYMBOL}-{TF}-{YYYY}-{MM}-{DD}.zip
CHECKSUM: 위 URL + .CHECKSUM (SHA256)
```

**Binance Vision CSV 컬럼 (USD-M Futures klines, 12개):**
```
open_time | open | high | low | close | volume | close_time | quote_volume | trades | taker_buy_base_vol | taker_buy_quote_vol | ignore
```

---

## 10. 재무 연산 정밀도

### Decimal.js

| 항목 | 내용 |
|------|------|
| 선택 이유 | 소수점 지원 (BigInt 미지원), 재무 표준, 검증된 라이브러리 |
| 위치 | `packages/shared/decimal/` |
| 적용 범위 | PnL, 수수료, 펀딩비, 잔고, 주문 가격, 포지션 사이징 |
| 제외 범위 | 기술 지표 (성능 우선, float 허용) |

**반올림 정책**

| 상황 | 모드 |
|------|------|
| 주문 수량 | `ROUND_DOWN` (잔고 초과 방지) |
| 표시/리포트 | `ROUND_HALF_UP` |

**DB 저장**

| 컬럼 종류 | 타입 | 예시 |
|-----------|------|------|
| 가격, PnL, 수수료 | `TEXT` | `"0.00123456"` (정밀 소수 문자열) |
| 지표 출력 | `NUMERIC` / `FLOAT` | 일반 수치 타입 |

**코드 예시**

```typescript
// 금지: 부동소수점 가격 연산
const profit = entryPrice * quantity * 0.001;

// 필수: Decimal.js 금액 계산
const profit = new Decimal(entryPrice).mul(quantity).mul('0.001');

// 허용: 지표 계산 (float 성능 우선)
const ema = previousEma + alpha * (close - previousEma);
```

---

## 11. 인증 & 보안

### Better Auth

- 인증 레이어 (`apps/api/`)
- JWT Access/Refresh Token 관리, 세션 처리 담당
- 소셜 로그인 등 확장 플러그인 지원

### 패스워드 해싱: Argon2id

| 파라미터 | 값 |
|----------|----|
| memory | 64MB |
| iterations | 3 |
| parallelism | 4 |

### JWT

| 토큰 | 만료 | 특이사항 |
|------|------|---------|
| Access Token | 15분 | Stateless |
| Refresh Token | 7일 | DB 저장, 취소 가능 |

### 거래소 API 키 암호화

- 알고리즘: AES-256-GCM
- 마스터 키: 환경 변수
- 복호화: 거래소 호출 직전에만 메모리 내 복호화 (로그 출력 금지)
- 키 로테이션: `bun run auth:rotate-master-key` (EP10-M4)

---

## 12. 실시간 스트리밍

### Server-Sent Events (SSE)

| 항목 | 내용 |
|------|------|
| 선택 이유 | 단방향(서버→클라이언트)으로 충분, WebSocket 대비 구현 단순 |
| 클라이언트 연결 한도 | 동시 최대 3개 (리소스 보호) |
| 인증 | 연결 초기에 JWT 검증 |
| 자동 재연결 | 클라이언트 측 지수 백오프 |
| 이벤트 종류 | 캔들, 전략 이벤트, 결정, 알림, 주문, 저널 |

---

## 13. 차트 & 시각화

### TradingView Lightweight Charts

| 항목 | 내용 |
|------|------|
| 선택 이유 | 오픈소스 (Apache 2.0), 무료, 충분한 기능 |
| 컴포넌트 | 캔들스틱, 지표 오버레이, 거래량 바 |
| 이벤트 마커 | LONG/SHORT 진입, WIN/LOSS/TIME_EXIT 청산 표시 |
| 실시간 | SSE 통합으로 라이브 캔들 업데이트 |
| 백테스트 시각화 | 에쿼티 커브, 드로우다운, PnL 분포, 월간 히트맵 |

### TradingView 무료 위젯

- Ticker Tape, Market Overview, Economic Calendar, Technical Analysis 게이지 등
- 유료 기능 미사용
- 위젯 로드 실패 시 Graceful degradation

---

## 14. 린팅 & 포매팅

### Biome

| 항목 | 내용 |
|------|------|
| 선택 이유 | 빠름, Bun 호환, ESLint+Prettier 대체 |
| 설정 | `biome.json` strict 설정 |
| 검증 | `bun run lint` — 에러 0건 필수 |

---

## 15. CI/CD & 배포

### GitHub Actions

| 잡 | 명령 | 실패 기준 |
|----|------|---------|
| lint | `bun run lint` | 에러 1건 이상 |
| typecheck | `bun run typecheck` | 타입 에러 |
| test:unit | `bun run test:unit` | 실패 케이스 |
| test:integration | `bun run test:integration` | PostgreSQL + pgvector 서비스 포함 |
| build | `bun run build` | 빌드 에러 |
| coverage-gate | — | `packages/core/*` ≥ 90%, 전체 ≥ 80% |
| performance | `bun run bench` vs baseline | 20% 이상 저하 |
| audit | `bun audit` | high/critical 취약점 |
| secret-scan | gitleaks | 시크릿 감지 |
| sandbox-escape | 전용 테스트 스위트 | 탈출 패턴 미차단 |

### Docker

```
Dockerfile.api      — Elysia API 서버
Dockerfile.workers  — supervisor + 전체 워커
Dockerfile.web      — Next.js 프로덕션 빌드
```

- 기반 이미지: Bun (버전 고정) ~100MB
- 최종 이미지 크기 ≤ 500MB
- 태그: `git describe --tags --always` (e.g. `v1.2.0-3-gabcdef`)
- 레지스트리: ghcr.io (MVP는 로컬 옵션)

### 배포 정책

- **수동 트리거 전용** — 실제 자금 운용 시스템, 자동 배포 금지
- 배포 전 kill switch 활성 상태이면 중단 (`--force` 오버라이드 가능)
- 배포 전 미체결 주문 없음 확인
- 배포 후 검증: `/api/health` 200, 캔들 갭 0, p95 지연 < 2초
- 롤백: `scripts/rollback.ts` → 이전 태그 복원, 2분 이내 완료

---

## 16. 로깅 & 관측성

### 구조화 로깅

- 포맷: stdout + JSON (초기), 이후 파일 로테이션 또는 외부 서비스 결정 (EP07)
- AOP `@Log` 데코레이터로 서비스 경계 자동 로깅
- API 키, 비밀 값 로그 출력 금지

### 지표 수집

| 지표 | 설명 |
|------|------|
| 파이프라인 지연 | 캔들 close → 결정 (p50/p95/p99) |
| 워커 헬스비트 | 30초 주기 alive/dead |
| 캔들 갭 수 | 0 = 정상 |
| 에러율 | 워커별 집계 |

- 인-메모리 실시간 집계 → 주기적 DB 영속
- `/api/health` 엔드포인트로 조회
- 성능 기준선: `.harness/benchmarks/baseline.json` (배포 후 업데이트)

---

## 성능 목표 요약

| 항목 | 목표 |
|------|------|
| 캔들 close → 결정 (p99) | < 1초 |
| 벡터 검색 (top_k=50) | < 100ms |
| 3년치 백테스트 완료 | < 5분 |
| 처리량 | ~5,000 캔들/초 |
| 시스템 가동률 | 99%+ (24/7) |
| 캔들 갭 발생률 | < 0.1% |

---

## 주요 결정 로그 요약

| 결정 | 선택 | 이유 |
|------|------|------|
| 런타임 | Bun | 네이티브 TS, 빠른 빌드, workspace 지원 |
| API | Elysia | Bun 네이티브, 타입-세이프 |
| ORM | DrizzleORM | pgvector 지원, 타입-세이프 마이그레이션 |
| 벡터 인덱스 | HNSW | 실시간 검색 + 즉시 사용 가능 (IVFFlat 탈락) |
| 거리 메트릭 | L2 | 코사인 아님 |
| 이벤트 버스 | PG LISTEN/NOTIFY | 외부 의존성 없음, 단일 노드 MVP 충분 |
| 재무 정밀도 | Decimal.js | 소수점 지원 (BigInt 탈락), 재무 표준 |
| 결정 엔진 위치 | vector-worker 인라인 | 이벤트 홉 제거로 ~50ms 절감 |
| 스트리밍 | SSE | 단방향으로 충분, WebSocket 불필요 |
| 차트 | TW Lightweight Charts | 오픈소스, 무료 |
| 인증 | JWT | Stateless, Tauri+Web 공용 지원 |
| 배포 | 수동 트리거 | 실제 자금, 운영자 확인 필수 |
| 렌더링 | Web=SSR, Desktop=Static Export | 웹은 SSR 프리페치로 빠른 첫 화면, 데스크탑은 Tauri WebView 호환 정적 빌드 |
| UI 공유 | packages/ui/ 공통 라이브러리 | 컴포넌트/뷰를 소스 레벨에서 공유, 앱 페이지는 얇은 래퍼 |
| 플랫폼 분기 | PlatformProvider + usePlatform() | packages/ui/platform/, Tauri SDK 동적 import → 웹 번들 제외 |
| Monaco CSP | `unsafe-eval` 허용 | Monaco 내부 동작용, 전략 실행은 V8 isolate (서버) |
| 토큰 저장 | httpOnly 쿠키 (통합) | 웹/Tauri WebView 동일 흐름, Keychain은 백업용 |
