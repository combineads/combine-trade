# 01-foundation

## Objective
코어 타입 시스템, DB 인프라, 설정 관리 — 모든 상위 레이어가 의존하는 기반 모듈을 구축한다.

## Scope
- `src/core/` (L0): 타입 정의, 상수, Decimal.js 래퍼, 포트 인터페이스
- `src/db/` (L1): PostgreSQL 연결 풀, 마이그레이션 인프라, 쿼리 헬퍼
- `src/config/` (L1): CommonCode 기반 설정 로더, 스키마 검증, 메모리 캐시

## Non-goals
- 개별 거래소 어댑터 구현 (EP-03)
- 비즈니스 로직 (지표, 시그널 등)
- 웹 UI

## Prerequisites
- EP-00 (부트스트랩) 완료 ✅
- Bun + TypeScript 프로젝트 초기 설정
- PostgreSQL + pgvector 확장 설치

## Milestones

### M0 — 기술 검증 Spike
- Deliverables:
  - `docs/decisions/ADR-004-tech-spike-results.md` — spike 결과 문서
  - 검증 항목:
    1. Bun + Drizzle ORM + PostgreSQL + pgvector: 연결, 쿼리, vector(202) 삽입/검색
    2. Bun + CCXT: import, Binance testnet REST 호출, WebSocket 연결
    3. Bun WebSocket 클라이언트: 10분 이상 장시간 연결 안정성
    4. Decimal.js 지표 계산 성능: BB20(120개 캔들) 1000회 반복 < 100ms
  - 각 항목별 pass/fail + 대안 결정
- Acceptance criteria:
  - 4개 항목 모두 검증 완료
  - fail 항목에 대해 대안 결정 (예: Drizzle → Kysely, CCXT → 직접 REST)
  - ADR 문서에 결과 기록
- Validation:
  - `bun run spike` (spike 스크립트 실행)

### M1 — 코어 타입 & 상수
- Deliverables:
  - `src/core/types.ts` — 모든 엔티티 타입, Enum 타입, FSM 상태 타입
  - `src/core/constants.ts` — BB20(20,2), BB4(4,4), MA(20/60/120) 구조적 앵커 (`as const`)
  - `src/core/decimal.ts` — Decimal.js 래퍼 (add, sub, mul, div, cmp, format)
  - `src/core/ports.ts` — ExchangeAdapter 인터페이스, DBAdapter 인터페이스
- Acceptance criteria:
  - 모든 엔티티 타입이 DATA_MODEL.md와 일치
  - Decimal 래퍼가 number 사용 없이 사칙연산/비교 지원
  - 구조적 앵커가 `as const`로 불변
  - ExchangeAdapter 포트가 CCXT 공통 메서드 추상화
- Validation:
  - `bun run typecheck`
  - `bun test -- --grep "core"`

### M2 — DB 인프라 & 기반 마이그레이션
- Deliverables:
  - `src/db/pool.ts` — Bun-compatible PostgreSQL 연결 풀
  - `src/db/migrations/001_base_schema.ts` — Master/Reference 테이블만 (Symbol, SymbolState, CommonCode) + pgvector 확장
  - `src/db/queries.ts` — 타입 안전 쿼리 빌더 (Drizzle ORM 또는 spike 결과에 따른 대안)
  - `src/db/migrate.ts` — 마이그레이션 실행기
- Acceptance criteria:
  - Symbol, SymbolState, CommonCode 테이블이 DATA_MODEL.md와 일치
  - pgvector 확장 활성화 확인
  - 금액/가격 컬럼이 모두 `numeric` 타입
  - 마이그레이션 멱등성 보장
  - Transaction 테이블은 해당 에픽에서 마이그레이션 추가 (EP-04: Candle, EP-05: Signal 등)
- Validation:
  - `bun run migrate` (테스트 DB)
  - `bun test -- --grep "db"`

### M3 — 설정 관리 (CommonCode)
- Deliverables:
  - `src/config/schema.ts` — CommonCode 그룹별 스키마 정의 (Zod)
  - `src/config/loader.ts` — DB에서 로드 → 메모리 캐시, 변경 시 갱신
  - `src/config/seed.ts` — 초기 시드 데이터 (EXCHANGE, TIMEFRAME, SYMBOL_CONFIG, KNN, ANCHOR 등)
  - `src/config/index.ts` — `loadConfig()`, `getConfig()`, `watchConfig()` 공개 API
- Acceptance criteria:
  - 모든 CommonCode 그룹이 DATA_MODEL.md 정의와 일치
  - ANCHOR 그룹은 수정 시 예외 발생 (애플리케이션 레벨 보호)
  - 시드 데이터로 초기 설정이 자동 삽입
  - 설정 변경 시 캐시 즉시 갱신
- Validation:
  - `bun test -- --grep "config"`
  - `bun run seed` (테스트 DB에 시드 삽입 확인)

### M4 — 프로젝트 빌드, 린트, 로거
- Deliverables:
  - `tsconfig.json` — strict 모드, path alias
  - `eslint.config.ts` — eslint-plugin-boundaries 레이어 규칙
  - `package.json` scripts — dev, build, test, lint, typecheck, migrate, seed
  - `.env.example` — 필수 환경변수 템플릿
  - `src/core/logger.ts` — 구조화 JSON 로거 (L0, 의존성 없음)
    - 필드: timestamp, level, module, symbol, exchange, event, details
    - 로그 레벨: error, warn, info, debug
    - 모듈별 로그 레벨 설정 가능
- Acceptance criteria:
  - `bun run lint` 통과
  - `bun run typecheck` 통과
  - `bun run build` 성공
  - 레이어 위반 시 lint 에러 발생 확인
  - 로거가 JSON lines 포맷 출력
  - 모든 후속 모듈에서 `core/logger` import 가능 (L0)
- Validation:
  - `bun run lint && bun run typecheck && bun run build`
  - `bun test -- --grep "logger"`

## Task candidates → Generated tasks mapping
- ~~T-01-001 (epic): 기술 검증 spike~~ → **Deferred** (TECH_STACK.md에서 기술 선택 완료, 호환성은 구현 중 검증)
- T-01-002 (epic) → **T-01-001**: 프로젝트 초기화 (Bun, tsconfig, Biome, 패키지 설치)
- T-01-003 (epic) → **T-01-002**: core/types.ts — 엔티티 타입 정의 (DATA_MODEL.md 기반)
- T-01-004 (epic) → **T-01-003**: core/constants.ts — 구조적 앵커 상수
- T-01-005 (epic) → **T-01-004**: core/decimal.ts — Decimal.js 래퍼 함수
- T-01-006 (epic) → **T-01-005**: core/ports.ts — ExchangeAdapter, DBAdapter 인터페이스
- T-01-007 (epic) → **T-01-006**: core/logger.ts — 구조화 JSON 로거
- T-01-008 (epic) → **T-01-007**: db/pool.ts — PostgreSQL 연결 풀
- T-01-010 (epic) → **T-01-008**: db/schema.ts — Drizzle ORM 스키마 (Symbol, SymbolState, CommonCode)
- T-01-009 (epic) → **T-01-009**: db/migrate.ts — 마이그레이션 러너 + 001 기반 스키마
- T-01-011 (epic) → **T-01-010**: config/schema.ts — CommonCode Zod 스키마
- T-01-012 (epic) → **T-01-011**: config/loader.ts — 설정 로더 & 메모리 캐시
- T-01-013 (epic) → **T-01-012**: config/seed.ts — 초기 시드 데이터 (NOTIFICATION 그룹 포함)
- T-01-014 (epic) → **T-01-013**: 레이어 의존성 검증 스크립트 (Biome에 boundaries 플러그인 없으므로 커스텀)
- T-01-015 (epic) → **T-01-014**: CI/빌드 통합 검증

## Risks
- **pgvector 확장 설치 실패**: Bun에서 pg 드라이버와 pgvector 호환성 확인 필요. 대안: postgres.js + pgvector 직접 쿼리. **M0 spike에서 검증.**
- **Drizzle ORM + Bun 호환성**: Drizzle의 Bun 지원이 불안정할 수 있음. 대안: Kysely 또는 직접 SQL. **M0 spike에서 검증.**
- **CCXT + Bun 호환성**: CCXT는 Node.js 전용 의존성(node:crypto, node:http) 사용 가능. 대안: Bun Node.js 호환 레이어, 또는 직접 REST 클라이언트. **M0 spike에서 검증.**
- **eslint-plugin-boundaries Bun 지원**: ESLint flat config와의 호환성 확인 필요. 대안: 커스텀 import 검증 스크립트.

## Decision log
- 모든 금액 컬럼에 `numeric` 타입 사용 (float 금지) — DATA_MODEL.md 준수
- CommonCode로 config.json 대체 — 웹 UI에서 설정 변경 가능
- ANCHOR 그룹 보호는 애플리케이션 레벨 (DB CHECK가 아닌 코드 검증)
- 초기 마이그레이션은 Master/Reference 테이블만 생성 — Transaction 테이블은 해당 에픽에서 추가 (구현 피드백 반영 용이)
- 구조화 로거를 core/logger.ts (L0)에 배치 — 모든 레이어에서 import 가능, 후속 모듈 개발 초기부터 사용
- CommonCode 시드에 NOTIFICATION 그룹 추가 (Slack 웹훅 URL 등)
- ORM 선택은 M0 spike 결과에 따라 결정 (Drizzle 우선, 대안 Kysely)
- M0 spike deferred — TECH_STACK.md에서 Drizzle + postgres.js + pgvector 조합 확정, 호환성은 M2 구현 중 자연스럽게 검증
- ESLint 대신 Biome 사용 (TECH_STACK.md 기준) — eslint-plugin-boundaries 대안으로 커스텀 레이어 검증 스크립트 채택
- db/queries.ts → db/schema.ts 명칭 변경 — Drizzle ORM에서 스키마 정의가 곧 타입 안전 쿼리 빌더 역할

## Consensus Log
- Round 1: Planner가 10개 에픽 초안 작성
- Round 1: Architect REVISED — 헬스체크 중복, EP-11 의존성 누락, 로거 위치(L7→L0), NOTIFICATION 그룹 누락, 벡터 피처 선행 태스크 부재 (5개 필수 + 3개 권장)
- Round 1: Critic REVISED — 기술 spike 부재, EP-06 과대 범위, 데몬 통합 리스크, 대조 오탐 안전장치 부재, WFO 상세 부족 등 (10개 필수)
- Round 2: 전체 피드백 반영 후 수정 — M0 spike 추가, EP-06/06b 분리, 로거 L0 이동, 마이그레이션 분산, 대조 안전장치, WFO 상세화 등
- Round 2: Architect APPROVED
- Round 2: Critic APPROVED
- Verdict: 2라운드 만에 컨센서스 달성

## Progress notes
- 2026-04-03: 태스크 생성 완료 (14개). M0 spike는 TECH_STACK 단계에서 기술 선택 완료되어 deferred.
- 2026-04-03: ESLint → Biome 전환 반영 (TECH_STACK.md 기준). 레이어 검증은 커스텀 스크립트로 대체.
- 2026-04-03: db/queries.ts → db/schema.ts로 변경 (Drizzle ORM은 스키마가 곧 쿼리 빌더)
