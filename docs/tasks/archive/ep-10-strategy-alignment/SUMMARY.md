# EP-10 Strategy Alignment — Archive Summary

- **Completed**: 2026-04-04
- **Tasks**: 15 (T-10-001 ~ T-10-015)
- **Tests added**: ~200 (1,853 → ~2,050+)
- **Source LOC**: ~2,000 (교정 위주, 순수 추가량 적음)
- **Waves**: 8 (Wave 1: 6 사이클 × WIP=2, Wave 2: 1 사이클, Wave 3: E2E)
- **QA failures**: 0
- **Review rejections**: 0

## Key decisions
- BB4 source=open — 구조적 앵커 변경, constants.ts + bollinger.ts source 파라미터 추가
- daily_bias 교차 검증을 knn(L4)가 아닌 pipeline(L9)에서 수행 — 레이어 규칙 위반 방지
- 벡터 피처 무효화 — 운영 전이므로 TRUNCATE 방안 채택
- spread 사전 체크(주문 전)와 slippage 체크(주문 후)는 별개 로직
- SymbolState FSM은 Ticket FSM과 동일 패턴 (TRANSITION_MAP + 순수 함수)
- 시간 감쇠 3단계 이산 (1.0/0.7/0.2)은 구조적 앵커 — CommonCode가 아닌 상수
- VECTOR_SPEC.md 문서를 features.ts 태스크에 흡수 — 코드+문서 동시 작성

## Outputs produced
- `src/core/constants.ts` — BB4 source=open
- `src/indicators/bollinger.ts` — source 파라미터, candlesToOpens()
- `src/indicators/types.ts` — bb4_1h, prevSma20 추가
- `src/filters/daily-direction.ts` — >=/<= 등호 허용
- `src/signals/evidence-gate.ts` — ONE_B MA20 검증, a_grade 1H BB4 연동
- `src/signals/safety-gate.ts` — TF별 wick_ratio, MA20 박스권, 2.0x 배수
- `src/signals/watching.ts` — squeeze wick_ratio, S/R ATR 거리, NEUTRAL 해제
- `src/vectors/features.ts` — strategy 피처 12개, FEATURE_WEIGHTS
- `src/vectors/vectorizer.ts` — 분모 교정 (body/open, wick/H, range/L)
- `src/vectors/normalizer.ts` — lookback=60, clamp, [0,1], NaN→0.5
- `src/knn/decision.ts` — 수수료 0.08% 차감, A급 50%/20
- `src/knn/time-decay.ts` — 3단계 이산 감쇠
- `src/positions/fsm.ts` — SymbolState FSM 전이 가드
- `src/orders/slippage.ts` — checkSpread() 순수 함수
- `src/orders/executor.ts` — spread 사전 체크 통합
- `src/limits/loss-limit.ts` — checkAccountDailyLimit() 계좌 합산
- `src/reconciliation/worker.ts` — FOR UPDATE 문서화, Slack panic close 연결
- `docs/specs/VECTOR_SPEC.md` — 전체 피처 공식 문서
