# 16-macro-retrospective

## Objective

매매 발생 시점의 거시경제 컨텍스트(경제지표 발표, 주요 뉴스)를 자동으로 수집하고, 매매 일지와 결합하여 LLM 기반 회고 리포트를 자동 생성한다. 트레이더가 "왜 이 매매가 실패했는가"를 매크로 이벤트 관점에서 체계적으로 분석하고, 전략별 이벤트 취약 구간을 데이터로 식별할 수 있게 한다.

나아가, 15분봉 이상 타임프레임에서는 kNN 통계 결정 이후 LLM이 2단계 필터로 작동하여, 과거 매매 기록 + 매크로 컨텍스트를 종합적으로 분석하고 최종 진입 여부를 판단한다.

## Scope

- `packages/core/macro/` — saveticker.com API 클라이언트, 이벤트-뉴스 도메인 로직
- `workers/macro-collector/` — 경제지표 일정 수집 (일 1회) + 이벤트 트리거 뉴스 수집
- `workers/retrospective-worker/` — LLM 회고 리포트 생성 (`claude -p` 서브프로세스)
- DB schema: `economic_events`, `news_items` 신규 테이블
- `trade_journals` 확장: `entry_macro_context` (JSONB), `retrospective_report` (TEXT), `retrospective_generated_at`
- `journal-worker` 확장: 일지 조합 시 매크로 컨텍스트 자동 부착
- 매크로 기반 자동 태그 추가
- 매크로 집계 분석 API
- `workers/llm-decision-worker/` — LLM 2단계 의사결정 워커 (15분봉 이상, opt-in)
- `strategies` 확장: `use_llm_filter` (boolean)
- `decisions` 확장: `llm_action`, `llm_reason`, `llm_confidence`
- `decision_pending_llm` 이벤트 버스 채널 추가

## Non-goals

- 실시간 뉴스 피드 (5분 폴링) — 이벤트 기반 수집으로 대체
- actual/forecast 수치 비교 — saveticker.com API에 해당 필드 없음; 추후 확장
- 다국어 뉴스 감성 분석 — 추후 확장
- 클라우드 배포 시 Anthropic API 직접 호출 마이그레이션 — EP17 이상에서 처리
- saveticker.com 외 다른 뉴스 소스 통합 — 추후 확장
- LLM이 kNN PASS를 LONG/SHORT로 승격 — kNN이 유일한 신호 발생자. LLM은 필터만 가능
- 15분봉 미만 타임프레임에서 LLM 의사결정 — 레이턴시 예산 불가

## Prerequisites

- `13-trade-journal` M3 — journal-worker 및 `trade_journals` 테이블 (일지 조합 선행 필요)
- `00-project-bootstrap` M6 — 이벤트 버스 인프라 (journal_ready 채널 추가)
- `06-alert-execution` M2 — alert-worker (Slack으로 회고 리포트 발송 시 선택적 사용)
- `03-vector-engine` M5 — vector-worker (M7 LLM 2단계 의사결정에서 분기 로직 삽입)
- `04-label-decision` M2 — decision engine (M7에서 decisions 테이블 확장)

## Milestones

### M1 — saveticker.com 클라이언트 + DB 스키마

- Deliverables:
  - `packages/core/macro/saveticker-client.ts` — HTTP 클라이언트
    - `fetchCalendarEvents(startDate, endDate): Promise<EconomicEvent[]>`
    - `fetchRecentNews(pageSize, afterTime?): Promise<NewsItem[]>`
    - 재시도 로직: 3회, exponential backoff (ERR_RETRY_)
    - 실패 시 null 반환 + 경고 로그 (파이프라인 블로킹 금지)
  - `packages/core/macro/types.ts` — 도메인 타입:
    ```typescript
    EconomicEvent {
      id, title, eventName, impactStars (1|2|3),
      scheduledAt, newsCollected, newsCollectedAt
    }
    NewsItem {
      id, externalId, headline, source,
      publishedAt, tags, economicEventId (nullable)
    }
    ```
  - `packages/core/macro/impact-parser.ts` — 제목에서 ★ 개수 파싱 → impact level
    - `★` = LOW, `★★` = MEDIUM, `★★★` = HIGH
  - DB 스키마 (`db/schema/macro.ts`):
    ```sql
    economic_events:
      id, external_id (unique), title, event_name
      impact (low/medium/high), scheduled_at
      news_collected (boolean default false)
      news_collected_at (timestamp nullable)
      created_at

    news_items:
      id, external_id (unique), headline, source
      published_at, tags (TEXT[])
      economic_event_id (FK economic_events, nullable)
      created_at
    ```
  - DrizzleORM 마이그레이션 생성
- Acceptance criteria:
  - `fetchCalendarEvents`가 실제 saveticker.com API 호출하여 파싱 정확히 완료
  - `★★★` → HIGH, `★★` → MEDIUM, `★` → LOW 정확히 매핑
  - API 호출 실패 시 예외 전파하지 않고 null + 로그
  - `bun run db:generate && bun run db:migrate` 성공
- Validation:
  ```bash
  bun test -- --filter "saveticker-client|impact-parser"
  bun run db:generate && bun run db:migrate
  ```

### M2 — 경제지표 캘린더 수집 워커 (일 1회)

- Deliverables:
  - `workers/macro-collector/calendar-collector.ts`
    - 매일 UTC 00:30 실행 (cron: `"30 0 * * *"`)
    - 오늘 ~ 7일 후 범위의 캘린더 이벤트 수집
    - upsert by external_id (멱등성)
    - HIGH/MEDIUM impact 이벤트만 저장 (LOW는 선택적 필터링 옵션)
  - `workers/macro-collector/index.ts` — 워커 진입점 (cron 스케줄러)
  - DB connection pool: 최대 2 (ARCHITECTURE.md 규칙 준수)
- Acceptance criteria:
  - 일 1회 실행 시 7일치 이벤트가 `economic_events`에 upsert
  - 중복 실행 시 데이터 중복 없음 (외부 ID 기준 upsert)
  - HIGH/MEDIUM impact 이벤트만 수집됨
  - 워커 단독 실행 가능: `bun run workers/macro-collector/index.ts`
- Validation:
  ```bash
  bun test -- --filter "calendar-collector"
  ```

### M3 — 이벤트 트리거 뉴스 수집

- Deliverables:
  - `workers/macro-collector/news-collector.ts`
    - 1분 주기 스케줄러
    - `economic_events`에서 `scheduled_at ≤ now - 5분 AND news_collected = false` 조회
    - 이벤트 발견 시:
      - saveticker.com 뉴스 API 호출 (page_size=50, sort=created_at_desc)
      - 이벤트 scheduled_at ±30분 내 뉴스만 필터링
      - `news_items` upsert (external_id 기준)
      - `economic_events.news_collected = true`, `news_collected_at = now()` 업데이트
    - 동시 수집 방지: DB advisory lock per economic_event_id
  - 에러 처리: saveticker.com 다운 시 해당 이벤트 재시도 (news_collected 유지 false)
- Acceptance criteria:
  - 이벤트 scheduled_at 경과 5분 후 자동 뉴스 수집 트리거
  - ±30분 외 뉴스 저장 안 됨
  - 동일 이벤트 중복 수집 없음
  - API 실패 시 news_collected = false 유지 → 다음 주기에 재시도
- Validation:
  ```bash
  bun test -- --filter "news-collector"
  ```

### M4 — 매매 일지 매크로 컨텍스트 부착

- Deliverables:
  - `packages/core/macro/context-enricher.ts`
    - `enrichWithMacroContext(entryTime, exitTime): Promise<MacroContext>`
    - 진입 시점 ±2시간 내 `economic_events` (HIGH/MEDIUM) 조회
    - 진입 시점 ±1시간 내 `news_items` 조회
    - 청산 시점 ±30분 내 이벤트/뉴스 조회
    - 반환: `{ entryEvents[], entryNews[], exitEvents[], exitNews[] }`
  - `packages/core/macro/macro-tagger.ts` — 매크로 기반 자동 태그 생성:
    - `fomc_week` — 진입일 기준 FOMC 이벤트 D-7 ~ D+1 범위
    - `cpi_day` / `nfp_day` / `pmi_day` — 이벤트명 키워드 매핑
    - `pre_high_impact_event` — 진입 후 24시간 내 ★★★ 이벤트 존재
    - `major_news_at_entry` — 진입 ±1시간 내 뉴스 2건 이상
    - `geopolitical_risk` — 뉴스 태그 또는 키워드 기반 (이란, 전쟁, 制裁 등)
  - `workers/journal-worker` 확장:
    - 일지 조합 시 `context-enricher` 호출 (비동기, fire-and-forget)
    - `trade_journals.entry_macro_context` (JSONB) 저장
    - `trade_journals.auto_tags`에 매크로 태그 병합
  - `trade_journals` 컬럼 추가 마이그레이션:
    - `entry_macro_context JSONB`
    - `retrospective_report TEXT`
    - `retrospective_generated_at TIMESTAMP`
- Acceptance criteria:
  - 일지 생성 시 진입 ±2시간 내 이벤트 자동 부착
  - 매크로 태그가 기존 자동 태그와 병합됨 (중복 없음)
  - 데이터 없으면 빈 배열 반환 (에러 아님)
  - 컨텍스트 부착이 journal-worker 레이턴시에 영향 없음 (비동기 저장)
- Validation:
  ```bash
  bun test -- --filter "context-enricher|macro-tagger"
  bun run db:generate && bun run db:migrate
  ```

### M5 — LLM 회고 리포트 생성 워커

- Deliverables:
  - `packages/core/macro/prompt-builder.ts` — 구조화된 프롬프트 조합:
    ```
    [전략 정보] 전략명, 심볼, 방향, 타임프레임
    [매매 결과] 진입/청산 가격, PnL, 결과 (WIN/LOSS/TIME_EXIT), hold_bars
    [의사결정 근거] winrate, expectancy, 유사 패턴 수, confidence_tier
    [기술 지표] 진입 시점 피처값 (RSI, ATR 등)
    [MFE/MAE] 최대 수익/손실 도달 시점
    [경제 이벤트] 진입 전후 ±2시간 이벤트 목록 (impact, 시간 차이)
    [주요 뉴스] 진입 전후 ±1시간 뉴스 헤드라인
    [분석 요청] 한국어로 이 매매를 회고 분석해줘. ...
    ```
  - `workers/retrospective-worker/index.ts` — 새 워커:
    - `journal_ready` 이벤트 버스 채널 수신 (EP13 journal-worker가 발행)
    - `trade_journals`에서 전체 컨텍스트 조회
    - `prompt-builder`로 프롬프트 조합
    - `Bun.spawn(['claude', '-p', prompt])` 실행
    - stdout 수집 → `trade_journals.retrospective_report` 저장
    - `retrospective_generated_at = now()` 업데이트
    - 실패 시: WARNING 로그, 재시도 없음 (다음 수동 트리거 또는 재배포 시 처리)
  - `journal_ready` 이벤트 버스 채널 추가 (ARCHITECTURE.md 반영):
    - Producer: journal-worker (journal 조합 완료 후 NOTIFY)
    - Consumer: retrospective-worker
  - DB connection pool: 최대 2
- Acceptance criteria:
  - `label_ready` → journal-worker 완료 → `journal_ready` → retrospective-worker 실행
  - `claude -p` 서브프로세스 stdout이 `retrospective_report`에 저장
  - claude CLI 미설치 환경에서 graceful degradation (경고 로그, 워커 종료 없음)
  - 리포트 언어: 한국어 (프롬프트에 명시)
  - 생성 시간: 비동기, 1초 레이턴시 예산과 무관
- Validation:
  ```bash
  bun test -- --filter "retrospective-worker|prompt-builder"
  ```

### M6 — 매크로 집계 분석 API

- Deliverables:
  - `GET /api/v1/macro/events` — 경제지표 캘린더 조회 (날짜 범위, impact 필터)
  - `GET /api/v1/journals/macro-analytics` — 매크로 이벤트별 성과 집계:
    - 이벤트 타입(FOMC/CPI/NFP/PMI)별 winrate, expectancy, 평균 MAE
    - 태그별 성과: `#pre_high_impact_event` 매매 vs 일반 매매 비교
    - 예시 응답:
      ```json
      {
        "fomc_week":       { "trades": 12, "winrate": 0.33, "avg_mae": 2.1 },
        "cpi_day":         { "trades":  8, "winrate": 0.25, "avg_mae": 3.4 },
        "normal_day":      { "trades": 67, "winrate": 0.62, "avg_mae": 0.8 }
      }
      ```
  - `GET /api/v1/journals/:id/retrospective` — 개별 매매 회고 리포트 조회
  - Elysia route 추가, JWT 인증 필수 (기존 미들웨어 재사용)
- Acceptance criteria:
  - 날짜 범위 필터 정확히 작동
  - 집계 수치가 수학적으로 정확 (테스트로 검증)
  - retrospective_report가 null이면 `{ report: null, pending: true }` 반환
  - 최소 1건 이상 샘플 없으면 해당 집계 항목 미포함
- Validation:
  ```bash
  bun test -- --filter "macro-api|macro-analytics"
  ```

### M7 — LLM 2단계 의사결정 (15분봉 이상)

- Deliverables:
  - **2단계 의사결정 파이프라인**:

    ```text
    candle close (≥15min)
        ↓
    [Stage 1] kNN + 통계 (< 1초) — 기존 파이프라인 그대로
        → PASS → 종료 (LLM 호출 안 함)
        → LONG/SHORT →
        ↓
    [Stage 2] LLM 평가 (< 60초) — 이 마일스톤에서 추가
        ↓
    최종 결정 → alert/execution
    ```

  - `packages/core/macro/decision-prompt-builder.ts` — 실시간 결정 프롬프트 조합:

    ```text
    [kNN 결과] winrate 62%, expectancy +0.42%, samples 47, confidence HIGH
    [현재 피처] RSI 38, ATR 2.1%, 거래량 상위 12%, BB 위치 -0.7σ
    [최근 매매 이력 10건]
      #1: 3일 전 LONG → LOSS (-0.8%), CPI 발표 직후, geopolitical_risk
      #2: 5일 전 LONG → WIN (+1.2%), 일반일, with_trend
      ...
    [현재 매크로]
      - FOMC D-1 (내일 22:00 ★★★)
      - 2시간 전 뉴스: "트럼프-이란 걸프 에너지 위협"
      - 24시간 내 ★★★ 이벤트 2건
    [판단 요청]
      위 정보를 종합하여 진입 여부를 판단하세요.
      반드시 아래 JSON 형식으로만 응답:
      { "action": "CONFIRM"|"PASS"|"REDUCE_SIZE",
        "reason": "한국어 2~3문장", "confidence": 0.0-1.0,
        "risk_factors": ["factor1", "factor2"] }
    ```

  - `packages/core/macro/llm-evaluator.ts` — LLM 호출 + 출력 파싱:
    - `Bun.spawn(['claude', '-p', prompt])` 실행 (timeout: 60초)
    - stdout → JSON 파싱 → `LlmDecision` 타입 검증
    - JSON 파싱 실패 시: 기본값 `CONFIRM` (kNN 결정 유지)
    - claude CLI 없거나 타임아웃: 기본값 `CONFIRM` + WARNING 로그
  - `workers/llm-decision-worker/index.ts` — 새 워커:
    - `decision_pending_llm` 채널 LISTEN
    - 컨텍스트 수집:
      - `decisions` 테이블에서 kNN 결과
      - `trade_journals` 최근 10건 (동일 전략+심볼, macro_context 포함)
      - `economic_events` 현재 시점 ±24시간
      - `news_items` 현재 시점 ±2시간
    - `decision-prompt-builder`로 프롬프트 조합
    - `llm-evaluator`로 LLM 호출
    - `decisions` 업데이트: `llm_action`, `llm_reason`, `llm_confidence`
    - 최종 결정 발행: `NOTIFY decision_completed`
      - CONFIRM → direction 유지
      - PASS → direction을 PASS로 변경
      - REDUCE_SIZE → direction 유지 + `size_modifier = 0.5` 메타데이터 추가
  - `decision_pending_llm` 이벤트 버스 채널:
    - Producer: vector-worker (LLM 활성 전략 + timeframe ≥ 15m + LONG/SHORT일 때)
    - Consumer: llm-decision-worker
  - vector-worker 분기 로직:

    ```text
    decision = kNN evaluate()
    IF decision.direction IN (LONG, SHORT)
       AND strategy.use_llm_filter == true
       AND strategy.timeframe >= '15m':
        → NOTIFY decision_pending_llm
    ELSE:
        → NOTIFY decision_completed (기존 그대로)
    ```

  - `strategies` 테이블 확장:
    - `use_llm_filter BOOLEAN DEFAULT false`
  - `decisions` 테이블 확장:
    - `llm_action TEXT` — 'CONFIRM' | 'PASS' | 'REDUCE_SIZE' | null (LLM 미사용 시)
    - `llm_reason TEXT` — LLM이 제시한 판단 근거
    - `llm_confidence DECIMAL` — LLM 자체 신뢰도 (0.0~1.0)
    - `llm_risk_factors TEXT[]` — LLM이 식별한 리스크 요인
    - `llm_evaluated_at TIMESTAMP` — LLM 평가 완료 시각
  - DB connection pool: 최대 2
- Acceptance criteria:
  - kNN PASS → LLM 미호출 확인 (API 비용 절약)
  - kNN LONG + LLM PASS → `decision_completed`에 direction=PASS 발행 → alert/execution 미실행
  - kNN LONG + LLM CONFIRM → `decision_completed`에 direction=LONG 발행 → alert/execution 정상 실행
  - kNN LONG + LLM REDUCE_SIZE → direction=LONG + size_modifier=0.5로 발행
  - `use_llm_filter = false`인 전략 → 기존 파이프라인 그대로 (LLM 개입 없음)
  - timeframe < 15m인 전략 → `use_llm_filter = true`여도 LLM 미호출
  - claude CLI 미설치 / 타임아웃 → CONFIRM 기본값 (kNN 결정 유지, 워커 종료 없음)
  - LLM 평가 60초 이내 완료
- Validation:

  ```bash
  bun test -- --filter "llm-decision|decision-prompt-builder|llm-evaluator"
  ```

#### Safety invariants (M7)

1. **kNN이 유일한 신호 발생자**: LLM은 절대 PASS → LONG/SHORT 승격 불가
2. **실패 시 기존 결정 유지**: LLM 장애 = CONFIRM (보수적 fallback)
3. **15분봉 미만 차단**: timeframe 체크는 vector-worker에서 하드코딩
4. **opt-in 전용**: `use_llm_filter` 명시적 활성화 필요
5. **감사 추적**: 모든 LLM 판단은 `decisions` 테이블에 기록 (action, reason, confidence, risk_factors)

### Boundary rule compliance
`packages/core/macro/` must not import Elysia, CCXT, or Drizzle directly. All DB access via injected repository interfaces. saveticker.com HTTP client uses native fetch only.

## Task candidates

- T-16-001: DB 스키마 설계 — `economic_events`, `news_items` 테이블 + DrizzleORM 마이그레이션 + impact-parser (★ → LOW/MEDIUM/HIGH)
- T-16-013: `trade_journals` 확장 마이그레이션 — `entry_macro_context`, `retrospective_report`, `retrospective_generated_at` 컬럼 추가
- T-16-002: saveticker.com HTTP 클라이언트 구현 — calendar + news API, 재시도, 에러 처리
- T-16-003: 캘린더 수집 워커 구현 — 일 1회 cron, 7일 범위, HIGH/MEDIUM upsert
- T-16-004: 이벤트 트리거 뉴스 수집 구현 — 1분 스케줄러, 5분 지연, ±30분 필터링
- T-16-005: `context-enricher` 구현 — 진입/청산 시점 ±2h 이벤트, ±1h 뉴스 조회
- T-16-006: `macro-tagger` 구현 — fomc_week, cpi_day, pre_high_impact_event 등 태그 로직
- T-16-014: journal-worker 확장 — 매크로 컨텍스트 비동기 부착 + 태그 병합
- T-16-015: `journal_ready` 이벤트 버스 채널 추가 — journal-worker NOTIFY, retrospective-worker LISTEN
- T-16-007: `prompt-builder` 구현 — 매매 + 매크로 컨텍스트 → 한국어 분석 프롬프트 조합
- T-16-008: `retrospective-worker` 구현 — `claude -p` 서브프로세스, stdout 저장, graceful degradation
- T-16-009: 매크로 집계 분석 API — `/api/v1/macro/events`, `/api/v1/journals/macro-analytics`
- T-16-016: 통합 테스트 (M1~M6) — 경제 이벤트 → 뉴스 수집 → 일지 컨텍스트 부착 → 회고 리포트 생성
- T-16-017: `strategies` 테이블 확장 — `use_llm_filter` 컬럼 + 마이그레이션
- T-16-018: `decisions` 테이블 확장 — `llm_action`, `llm_reason`, `llm_confidence`, `llm_risk_factors`, `llm_evaluated_at` 컬럼
- T-16-010: `decision-prompt-builder` 구현 — kNN 결과 + 최근 매매 이력 + 매크로 컨텍스트 → 구조화 프롬프트
- T-16-011: `llm-evaluator` 구현 — `claude -p` 호출, JSON 파싱, 타임아웃/장애 시 CONFIRM fallback
- T-16-019: `decision_pending_llm` 이벤트 버스 채널 + vector-worker 분기 로직 (timeframe ≥ 15m + opt-in 체크)
- T-16-012: `llm-decision-worker` 구현 — 컨텍스트 수집 → LLM 평가 → 최종 결정 발행 (CONFIRM/PASS/REDUCE_SIZE)
- T-16-020: 통합 테스트 (M7) — kNN LONG → LLM PASS 오버라이드 → alert/execution 미실행 확인

## Risks

- **saveticker.com API 가용성**: 공식 SLA 없음. 엔드포인트 변경 또는 인증 추가 시 수집 중단.
  - 완화: HTTP 클라이언트를 인터페이스로 추상화. 대체 소스(Finnhub) 전환 시 client만 교체.
- **claude CLI 환경 의존**: `claude` 바이너리가 워커 실행 환경에 있어야 함. 클라우드 배포 시 사용 불가.
  - 완화: graceful degradation (CLI 없으면 경고 로그만, 워커 종료 없음). 클라우드 전환 시 Anthropic API 직접 호출로 교체 (프롬프트 빌더는 재사용).
- **뉴스 관련성 낮음**: saveticker.com 뉴스가 주식 중심. 크립토 선물 관련성 낮을 수 있음.
  - 완화: `tag_names` 필터링 + 키워드 기반 관련성 스코어 (추후 개선). 초기엔 모든 뉴스 포함.
- **LLM 리포트 품질 불안정**: 동일 입력에 다른 출력. 회고는 참고용이므로 허용 범위.
  - 완화: 프롬프트 고정 구조화. 출력은 저장만.
- **LLM 2단계 결정의 비결정론성**: 동일 조건에서 다른 결정을 내릴 수 있음.
  - 완화: (1) LLM 실패 시 CONFIRM fallback으로 kNN 결정 보존 (2) 모든 LLM 판단을 decisions 테이블에 기록하여 사후 검증 가능 (3) M6 macro-analytics로 LLM override 효과 통계 추적.
- **LLM 2단계 도입 후 백테스트 불일치**: 백테스트는 kNN만 사용, 실전은 kNN+LLM → 성과 비교 시 차이 발생.
  - 완화: 백테스트 결과는 kNN 기준으로 유지. LLM override 비율과 효과는 별도 대시보드에서 추적 (예: "LLM이 PASS한 50건 중 실제 LOSS였던 비율 72%").
- **15분봉 진입 지연**: LLM 평가에 30~60초 소요 시 진입 가격이 이미 변동.
  - 완화: 15분봉에서 30~60초 지연은 일반적으로 의미있는 가격 변동을 유발하지 않음. 극단적 변동성 구간에서는 LLM이 이를 감지하고 PASS할 가능성 높음.

## Decision log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-22 | 뉴스 폴링 대신 경제 이벤트 트리거 방식 채택 | 이벤트 없는 날 불필요한 API 호출 제거. 뉴스-이벤트 맥락 연결 보장. |
| 2026-03-22 | saveticker.com API 직접 호출 (스크래핑 아님) | `api.saveticker.com` 공개 JSON API 확인. Cloudflare 우회 불필요. 인증 없이 접근 가능. |
| 2026-03-22 | LLM 리포트 생성: `claude -p` 서브프로세스 | 로컬 환경 전용. API 키 관리 불필요. 클라우드 전환 시 Anthropic API로 교체 예정 (prompt-builder 재사용). |
| 2026-03-22 | actual/forecast 수치 비교 제외 | saveticker.com calendar API에 해당 필드 없음. 추후 다른 소스로 보완 가능. |
| 2026-03-22 | 회고 리포트는 자동 실행 결정과 완전 분리 | LLM 출력은 비결정론적. 트레이더 참고용 분석에만 사용. 진입/청산 결정 파이프라인에 절대 연결 안 함. |
| 2026-03-22 | `packages/core/macro` 신규 모듈 | ARCHITECTURE.md 경계 준수. Elysia/CCXT/Drizzle 직접 임포트 금지. |
| 2026-03-22 | LLM 2단계 의사결정: 15분봉 이상 전용 + opt-in | 15분봉은 다음 봉까지 900초 여유 — LLM 평가에 60초 사용해도 충분. 1분/3분봉은 레이턴시 불가. |
| 2026-03-22 | LLM 실패 시 CONFIRM (kNN 결정 유지) | LLM이 장애점이 되면 안 됨. 보수적 fallback으로 기존 파이프라인 보호. |
| 2026-03-22 | LLM은 PASS → LONG/SHORT 승격 불가 | kNN이 유일한 신호 발생자. LLM은 필터(억제) 역할만. 안전 불변식. |
| 2026-03-22 | vector-worker에서 `decision_pending_llm` 분기 | alert/execution 워커는 `decision_completed`만 수신 — 기존 워커 코드 변경 없이 LLM 파이프라인 삽입. |
| 2026-03-22 | 이전 매매 기록을 LLM context에 포함 | 과거 매매 결과 + 그때 매크로 = few-shot 패턴. LLM이 "CPI일에 이 전략 3연패" 같은 경험적 패턴 활용 가능. |

## Progress notes

- 2026-03-22: Epic drafted. saveticker.com API 두 엔드포인트 모두 공개 접근 확인 완료.
- 2026-03-22: M7 추가 — LLM 2단계 의사결정 (15분봉 이상). kNN Stage 1 + LLM Stage 2 아키텍처.
- 2026-03-25: All tasks complete. T-16-001 through T-16-020 in done/. Epic fully implemented.
