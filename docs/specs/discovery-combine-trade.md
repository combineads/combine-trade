# Discovery: Combine Trade - Double-BB Automated Trading System

## Date
2026-04-03

## Problem statement
김직선 트레이더의 Double-BB(더블비) 매매법을 BTCUSDT/XAUTUSDT 크립토 선물에 대해 자동화한다. 일봉/1시간봉으로 방향과 맥락을 설정하고, 5분봉/1분봉 BB4 터치에서 진입하며, KNN 통계로 최종 LONG/SHORT/PASS를 결정하는 하이브리드 시스템을 구축한다. 인간의 감정을 배제한 기계적 집행을 목표로 한다.

## Goal
- 김직선 직관의 70~80%를 담는 확률적 집행관 봇 구축
- 멀티 거래소(Binance, OKX, Bitget, MEXC) 동시 운용
- 백테스트 → analysis → alert → live 단계적 배포
- 최종 목표: 3천만원 자본, 양(+)의 expectancy 지속

## Scope

### In scope
- 캔들 수집 (WebSocket + 히스토리)
- 일봉 방향 필터
- 거래차단(TradeBlock) 시스템 (장 개장, 경제지표, 펀딩비, 수동)
- WATCHING 판단 (1H close)
- Evidence Gate (5M/1M BB4 터치)
- Safety Gate (꼬리 없는 캔들, 박스권 중심, 큰 캔들 역추세)
- 1M 노이즈 필터 (5M MA20 방향)
- 202차원 벡터화 + Median/IQR 정규화
- KNN 의사결정 (cosine/L2, time decay, A급 신호)
- 슬리피지 방어 (spread + slippage 체크)
- 동적 포지션 사이징 (Decimal.js)
- 3단계 청산 (TP1/TP2/트레일링, 티켓별 독립)
- 피라미딩 (불타기만, max 2회)
- Loss Limit (일일/세션/1H)
- Reconciliation Worker (1분 주기)
- 크래시 복구
- 레이블링 (WIN/LOSS/TIME_EXIT)
- 실행 모드 (analysis/alert/live)
- Slack 알람
- 웹 UI (React + Vite + Zustand + TanStack Query)
- 백테스트 (라이브와 동일 코드 경로)
- WFO (Walk-Forward Optimization)
- 멀티 거래소 ExchangeAdapter 추상화

### Out of scope
- 멀티 유저
- 그 외 없음 (백로그 0건)

## Constraints
- **런타임**: 단일 Bun 프로세스
- **DB**: PostgreSQL + pgvector (HNSW)
- **거래소 연동**: CCXT 라이브러리
- **금액 계산**: Decimal.js (float 금지)
- **구조적 앵커 불변**: BB20(20,2), BB4(4,4), MA기간(20/60/120), 정규화 방식
- **캔들 수집**: 거래소별로 수집 (같은 심볼도 거래소마다 가격이 다르므로 해당 거래소 캔들로 SL/TP 계산)
- **최대 레버리지**: 38배 상한
- **초기 자본**: 30만원 → 3천만원 확대 계획
- **웹 UI 빌드**: `bun run build` → Bun.serve() 정적 배포
- **인증**: 단일 사용자 패스워드 → JWT (HttpOnly 쿠키)

## Success criteria
- [ ] 백테스트 결과: expectancy > 0, MDD 감당 가능 범위
- [ ] WFO: OOS expectancy > 0, WFO efficiency > 0.5
- [ ] analysis 모드 2주+: 신호 빈도/비율이 백테스트와 유사
- [ ] alert 모드 2주+: 10건+ 완결 거래 정상 실행
- [ ] Reconciliation 일치율 99% 이상
- [ ] 크래시 복구 후 포지션 정상 복원
- [ ] SL이 항상 거래소에 등록되어 데몬 다운 시 계좌 보호
- [ ] Loss Limit(일일 10%, 세션 3회, 1H 2/1회) 정상 작동
- [ ] 4개 거래소 ExchangeAdapter 정상 동작

## Ambiguity score
- Goal: 0.95 / 1.0
- Constraints: 0.85 / 1.0
- Criteria: 0.85 / 1.0
- Overall ambiguity: **11%** (threshold: 20%)

## Q&A transcript
### Round 0 (initial assessment)
- PRD v1.2가 202차원 벡터, FSM 상태 전이, 거래소별 API 차이, 3단계 청산, 피라미딩 로직까지 상세하게 명시하여 추가 질문 없이 threshold 충족.

## Open questions (development-phase verification)
PRD 자체에 "확인 필요"로 표기된 항목들. 요구사항 모호성이 아닌 개발 중 검증 사항:

1. **XAUTUSDT 선물 페어**: 4개 거래소(Binance, OKX, Bitget, MEXC) 존재 여부 → 없으면 PAXGUSDT 대안 또는 BTCUSDT만
2. **MEXC 1단계 주문**: 진입+SL 동시 등록 가능 여부 → 미지원 시 2단계 fallback
3. **MEXC editOrder**: SL 수정 지원 여부 → 미지원 시 cancel+create
4. **분할 청산 API**: 거래소별 `reduceOnly` + 수량 지정 방식 차이 실제 테스트
5. **Investing.com API**: 별3개 경제지표 자동 수집 방식 및 접근성

## Next step
Run `harness-project-bootstrap` to initialize project structure, then `harness-architect` for architecture design.
