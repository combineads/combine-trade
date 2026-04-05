# QUALITY_SCORE.md

## Scoring rubric
Score each category from 0 to 5.

- Documentation truthfulness
- Architecture clarity
- Validation coverage
- Reliability readiness
- Security hygiene
- Developer experience

## Current score (2026-04-05, post EP-18)
| Category | Score | Notes |
|---|---:|---|
| Documentation truthfulness | 4 | alignment review에 EP-18 완료 배너 추가. ARCHITECTURE.md kpi/economic-calendar 미구현 표시. PRODUCT.md "box range center" 표현 모호 |
| Architecture clarity | 5 | L0~L9 전체 구현. L5→L6 레이어 경계를 LabelingDeps DI 패턴으로 해결 |
| Validation coverage | 5 | 2,925 tests / 0 fail (+659 신규). EP-18 전 P0 수정 모두 TDD 적용 |
| Reliability readiness | 5 | 손실 카운터 리셋 daemon 연결. FSM WATCHING↔IDLE 전이 DB 기록. Vector 라벨링 단일 TX |
| Security hygiene | **3** | 변동 없음. 킬스위치 CLI 미인증 유지 |
| Developer experience | **5** | _resetModuleStateForTesting() 클린 export. 테스트 격리 패턴 확립 |

**Total: 27/30 (documentation truthfulness -1)**

## Score changes from EP-12 to EP-18
| Category | EP-12 | EP-18 | Delta | Evidence |
|---|---:|---:|---:|---|
| Documentation truthfulness | 5 | 4 | -1 | alignment review 9건 P0가 미수정으로 표시됨 (배너로 패치). ARCHITECTURE.md 미구현 모듈 주석 추가 |
| Validation coverage | 5 | 5 | 0 | +659 테스트 (2,266→2,925). EP-18 P0 전건 TDD |
| Reliability readiness | 5 | 5 | 0 | 손실 카운터 리셋, FSM 전이, Vector 라벨링 연결 완료 |

## Top 3 quality risks
1. **Vector DB 무효화**: T-18-004 캔들 피처 분모 변경 → 기존 벡터와 신규 벡터 거리 비교 무의미. 재구축 필요
2. **EventLog 비규약 타입**: PIPELINE_LATENCY, DAILY_BIAS_MISMATCH가 EVENT_TYPES 상수에 없음
3. **processEntry() 340+ 줄**: 12단계 진입 파이프라인이 단일 함수. 리팩토링 권장

## Next cleanup targets
- 벡터 재구축 스크립트 (T-18-004 후속)
- P1 불일치 수정 에픽 (WatchSession A/B, ma20_slope 3봉, rsi_extreme_count 히스토리)
- EventLog EVENT_TYPES 상수 정리
- ARCHITECTURE.md kpi/ 미구현 placeholder 해소 (EP-16 구현)
- 킬스위치 CLI 인증 추가 (Security hygiene 4점 목표)
