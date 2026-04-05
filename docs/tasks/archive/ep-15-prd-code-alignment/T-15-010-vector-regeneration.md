# T-15-010 벡터 무효화 마이그레이션 + 재생성 스크립트 + 운영 절차

## Metadata
- modules: [vectors, db]
- primary: vectors

## Goal
6카테고리→38봉 구조 변경으로 무효화된 기존 벡터를 처리하고, 캔들 히스토리에서 새 구조의 벡터를 재생성하는 스크립트를 구현한다.

## Why
벡터 구조가 근본적으로 변경되어 기존 ~315K 벡터가 KNN에서 의미 없는 결과를 반환한다. 재생성 시 Ticket 데이터에서 라벨(WIN/LOSS/TIME_EXIT)도 복원해야 KNN 학습이 가능하다.

## Inputs
- 새 vectorizer (T-15-006)
- DB vectors 테이블 (기존 데이터)
- DB tickets 테이블 (라벨 복원용)
- DB candles 테이블 (히스토리 재생성용)

## Dependencies
- T-15-006 (새 vectorizer 구현 완료)
- T-15-009 (KNN commission CommonCode 완료 — 재생성 시 완전한 설정 필요)

## Expected Outputs
- DB 마이그레이션 파일
- `scripts/regenerate-vectors.ts`
- 운영 절차 문서

## Deliverables
- `src/db/migrations/XXX-invalidate-vectors.ts` — vectors 테이블 truncate 또는 is_valid 플래그
- `scripts/regenerate-vectors.ts` — 배치 재생성 스크립트
- 운영 절차 (스크립트 내 주석 또는 README)

## Constraints
- 재생성 전 execution_mode=analysis 강제 전환 필수
- 배치 처리 (1000벡터/batch) + 진행률 표시
- 라벨 복원: Ticket.closed_at + symbol + exchange + timeframe 조인
- 매칭 Ticket 없는 벡터: unlabeled로 표기
- 목표 시간: < 30분 (315K 벡터)

## Steps
1. DB 마이그레이션 작성 (vectors truncate 또는 is_valid=false)
2. `scripts/regenerate-vectors.ts` 구현:
   - 시작 전 execution_mode 검증 (analysis 아니면 경고 + 확인)
   - 심볼×거래소×타임프레임별 캔들 히스토리 로드
   - 38봉 슬라이딩 윈도우로 벡터 재생성
   - Ticket 조인으로 라벨 복원
   - 1000벡터/batch upsert + 진행률 표시
3. 운영 절차 문서 작성:
   - (1) execution_mode=analysis 전환
   - (2) pg_dump --table=vectors 백업
   - (3) 마이그레이션 실행
   - (4) 재생성 스크립트 실행
   - (5) bun run backtest 검증
   - (6) execution_mode 복원

## Acceptance Criteria
- 기존 벡터가 KNN 검색에 사용되지 않음
- 재생성 벡터에 라벨이 Ticket 기반으로 복원됨
- 매칭 Ticket 없는 벡터는 unlabeled 처리됨
- 스크립트 시작 전 execution_mode 검증
- `bun run typecheck` 통과

## Test Scenarios
N/A — 스크립트/마이그레이션 태스크 (통합 검증은 T-15-011에서 수행)

## Validation
- `bun run typecheck`
- 마이그레이션 dry-run 성공
- 스크립트 --dry-run 모드로 실행 → 진행률 표시 + 예상 시간 출력

## Out of Scope
- 백테스트 검증 (T-15-011)
- KNN 엔진 변경 (M4에서 완료)

## Implementation Notes

### 마이그레이션
- `drizzle/0007_invalidate_vectors.sql`: `TRUNCATE TABLE "vectors"` 단일 구문
- `drizzle/meta/_journal.json`: idx=7 항목 추가 (tag: `0007_invalidate_vectors`)
- `drizzle/meta/0007_snapshot.json`: 0006 스냅샷 기반, id/prevId 갱신 (스키마 변경 없음)
- signals.vector_id → vectors.id FK가 없으므로 TRUNCATE 시 cascade 없음

### 재생성 스크립트
- `scripts/regenerate-vectors.ts`
- CLI 옵션: `--dry-run`, `--symbol`, `--exchange`, `--timeframe`, `--batch-size`
- 슬라이딩 윈도우: WARMUP_SIZE=200 + WINDOW_SIZE=38. 총 238봉 미만 심볼은 스킵
- 지표 계산: `calcAllIndicators(candles[0..i])` — 웜업 포함 전체 히스토리 사용
- 벡터 생성: `vectorize(window38, indicators, timeframe)` → 202차원 Float32Array
- 라벨 매칭: Ticket.closed_at ∈ [candle.open_time, open_time+60s) 범위로 근사
  - 매칭 없는 벡터: label=null, grade=null (unlabeled)
- 배치 upsert: `ON CONFLICT (candle_id) DO UPDATE` — 멱등성 보장
- execution_mode 사전 검증: analysis 아닌 심볼 목록 출력 후 3초 대기 (dry-run은 경고만)
- `bun run typecheck` 통과 확인

### 설계 결정
- TRUNCATE 선택 이유: 이전 벡터 구조가 202차원이 아니어서 어떤 행도 재사용 불가
- WARMUP_SIZE=200: SMA120/EMA120 안정화에 최소 120봉 필요 → 여유분 80봉 추가
- 라벨 매칭 60초 허용 범위: Ticket.closed_at이 정확한 캔들 close 시각을 보장하지
  않을 수 있어 1분 버킷으로 근사. 정밀도가 필요하면 T-15-011 검증에서 조정

## Outputs
- `drizzle/0007_invalidate_vectors.sql`
- `drizzle/meta/_journal.json` (0007 항목 추가)
- `drizzle/meta/0007_snapshot.json`
- `scripts/regenerate-vectors.ts`
