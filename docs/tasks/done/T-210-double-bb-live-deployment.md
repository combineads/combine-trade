# T-210 Double-BB live deployment & go-live checklist

## Goal
Binance Futures API credentials 등록, hedge mode 활성화, kill switch 테스트, daily loss limit 설정, position sizing 확인 후 execution_mode를 'live'로 전환한다.

## Why
EP17-M5 최종 단계: readiness score ≥ 70 확인 후 실제 Binance 라이브 트레이딩을 시작한다.

## Inputs
- T-209: readiness score ≥ 70 확인
- API: credentials 등록 엔드포인트 (AES-256-GCM 암호화 — T-082)
- API: kill switch 엔드포인트
- API: execution_mode 전환 엔드포인트

## Dependencies
T-209

## Expected Outputs
- Binance Futures 자격증명 DB 등록 (암호화 저장)
- hedge mode 활성화 (`dualSidePosition=true`)
- Kill switch 1초 이내 전파 확인
- Daily loss limit 설정
- execution_mode → 'live' 전환

## Deliverables
- `scripts/go-live-checklist.ts` — go-live 체크리스트 스크립트:
  - credentials 등록 여부 확인
  - Binance hedge mode 상태 확인
  - kill switch 활성화/비활성화 1초 이내 테스트
  - daily loss limit 설정 값 확인
  - position sizing 설정 확인
  - readiness score 재확인 (≥ 70)
  - "go live" 확인 문자 입력 프롬프트
  - execution_mode → 'live' 전환 API 호출
- `docs/runbooks/go-live.md` — go-live 절차 문서 (1회성 참조용)

## Constraints
- go-live 확인은 반드시 대화형 입력("go live" 텍스트 확인) 필요
- credentials는 절대 로그에 노출 금지
- kill switch 테스트 후 반드시 재활성화 확인

## Steps
1. `scripts/go-live-checklist.ts` 작성
2. Binance API credentials를 API를 통해 등록 (암호화)
3. Binance hedge mode 활성화 확인
4. Kill switch 테스트 (비활성화 → 1초 이내 전략 평가 중단 → 재활성화)
5. Daily loss limit + position sizing 설정
6. Readiness score 최종 확인
7. "go live" 입력 → execution_mode 'live' 전환

## Acceptance Criteria
- `scripts/go-live-checklist.ts` 실행 시 모든 항목 ✅
- Kill switch 1초 이내 전파 확인
- Binance hedge mode: `dualSidePosition=true`
- execution_mode → 'live' 전환 후 Binance 주문 정상 실행
- Slack 알림에 실제 체결 정보 포함

## Validation
```bash
bun run typecheck
bun run scripts/go-live-checklist.ts
```

## Out of Scope
코드 사이닝, CI/CD 자동화, multi-symbol 확장
