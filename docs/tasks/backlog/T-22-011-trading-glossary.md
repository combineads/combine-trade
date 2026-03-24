# T-22-011 트레이딩 용어 한/영 대조표 작성

## Goal
`packages/ui/src/i18n/glossary.md`에 Combine Trade에서 사용하는 트레이딩 도메인 용어의 한/영 대조표를 작성한다. 이후 모든 뷰 번역 태스크에서 이 glossary를 참조하여 용어 일관성을 유지한다.

## Why
번역 태스크가 여러 개로 분산되어 있기 때문에, 사전에 도메인 용어 기준을 정해두지 않으면 "전략"과 "Strategy", "손절"과 "Stop Loss" 같은 용어가 뷰마다 다르게 번역될 위험이 있다.

## Inputs
- `docs/exec-plans/22-internationalization.md` — 도메인 용어 예시
- `packages/ui/src/views/` — 현재 코드에서 사용 중인 용어 목록
- `docs/PRODUCT.md` — 제품 도메인 용어

## Dependencies
T-22-001

## Expected Outputs
- `packages/ui/src/i18n/glossary.md` — 한/영 대조표
- glossary 기준으로 `common` namespace 키명 확인 (T-22-005와 정합성)

## Deliverables
- `packages/ui/src/i18n/glossary.md`:
  - **번역 고정 영어 용어** (양쪽 언어에서 영어 유지): LONG, SHORT, PASS, PnL, P&L, USDT, BTC, API, Stop Loss, Take Profit, RSI, MACD, Bollinger Band
  - **한국어 대응 용어**: 전략↔Strategy, 신호↔Signal, 진입↔Entry, 청산↔Exit/Close, 포지션↔Position, 손절↔Stop Loss, 익절↔Take Profit, 손익↔Profit/Loss, 주문↔Order, 체결↔Filled, 취소↔Cancelled, 대기↔Pending, 킬스위치↔Kill Switch, 일일손실한도↔Daily Loss Limit, 레버리지↔Leverage, 백테스트↔Backtest, 이벤트↔Event, 벡터↔Vector, 알림↔Alert, 워커↔Worker, 수수료↔Fee
  - **형식**: 마크다운 테이블 (한국어 | 영어 | 비고)
  - **비고 컬럼**: 번역 불가 이유 또는 사용 맥락 설명

## Constraints
- 이 파일은 문서이므로 코드 변경 없음
- glossary에 없는 새 용어 발견 시 이 파일에 추가 후 사용
- 한국어 번역이 어색한 트레이딩 전문 용어는 영어 유지로 표시

## Steps
1. `packages/ui/src/views/` 코드에서 사용 중인 UI 문자열 목록화
2. `docs/PRODUCT.md` 도메인 용어 참조
3. glossary 초안 작성
4. 번역 불가 영어 고정 용어 목록 확정
5. `glossary.md` 파일 작성

## Acceptance Criteria
- `glossary.md` 에 최소 30개 이상 용어 항목
- 번역 고정 영어 용어 목록 명확히 구분
- LONG, SHORT, PASS, Stop Loss, Take Profit이 "번역 고정" 목록에 포함
- 마크다운 테이블 형식 준수

## Validation
```bash
# 파일 존재 확인
ls packages/ui/src/i18n/glossary.md
```

## Out of Scope
실제 번역 적용 (각 뷰 번역 태스크에서 처리), 서버/API 에러 메시지 번역
