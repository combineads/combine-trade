# combine-trade 논리 데이터 모델 (ERD)

> 2M + 1R + 10T = 13개 엔티티 | Double-BB + KNN 자동매매 시스템

## 전체 논리 모델

```mermaid
erDiagram
    %% ========================================
    %% 마스터 (M) — 거래소별 심볼
    %% ========================================
    심볼 {
        text 심볼코드 PK "BTCUSDT"
        text 거래소 PK "binance/okx/..."
        text 이름
        text 기초자산
        text 견적자산
        boolean 활성여부
    }

    심볼상태 {
        uuid 식별자 PK
        text 심볼코드 FK
        text 거래소 FK
        text FSM상태 "IDLE/WATCHING/HAS_POSITION"
        text 실행모드 "analysis/alert/live"
        text 일간방향 "LONG_ONLY/SHORT_ONLY/NEUTRAL"
        numeric 일봉시가
        numeric 세션박스고가
        numeric 세션박스저가
        numeric 오늘누적손실금액
        integer 세션손절횟수
        integer 시간내5M손절횟수
        integer 시간내1M손절횟수
    }

    %% ========================================
    %% 레퍼런스 (R) — 공통 설정
    %% ========================================
    공통코드 {
        text 그룹코드 PK
        text 코드 PK
        jsonb 값
        text 설명
        boolean 활성여부
    }

    %% ========================================
    %% 트랜잭션 (T) — 필터
    %% ========================================
    거래차단 {
        uuid 식별자 PK
        text 차단유형 "경제이벤트/펀딩/수동/장개장"
        timestamptz 시작시각
        timestamptz 종료시각
        text 사유
        boolean 반복여부 "고정패턴=true"
        jsonb 반복규칙
        jsonb 원본데이터
    }

    %% ========================================
    %% 트랜잭션 (T) — 파이프라인
    %% ========================================
    캔들 {
        uuid 식별자 PK
        text 심볼코드 FK
        text 거래소 FK
        text 타임프레임 "1D/1H/5M/1M"
        timestamptz 시작시각
        numeric 시가
        numeric 고가
        numeric 저가
        numeric 종가
        numeric 거래량
        boolean 마감여부
    }

    감시세션 {
        uuid 식별자 PK
        text 심볼코드 FK
        text 거래소 FK
        text 감지유형 "스퀴즈돌파/SR합류/BB4터치"
        text 방향 "LONG/SHORT"
        numeric TP1목표가 "1H MA20"
        numeric TP2목표가 "1H 반대편 BB20"
        timestamptz 감지시각
        timestamptz 종료시각 "null=활성"
        text 종료사유
        jsonb 감지컨텍스트
    }

    시그널 {
        uuid 식별자 PK
        text 심볼코드 FK
        text 거래소 FK
        uuid 감시세션식별자 FK
        text 타임프레임 "5M/1M"
        text 시그널유형 "DOUBLE_B/ONE_B"
        text 방향 "LONG/SHORT"
        numeric 예상진입가
        numeric 예상손절가
        boolean 안전게이트통과
        text KNN판정 "PASS/FAIL/SKIP"
        boolean A등급여부
        uuid 벡터식별자 FK
    }

    시그널상세 {
        uuid 식별자 PK
        uuid 시그널식별자 FK
        text 키 "bb4_touch_price/wick_ratio/..."
        numeric 수치값
        text 텍스트값
    }

    %% ========================================
    %% 트랜잭션 (T) — KNN 벡터
    %% ========================================
    벡터 {
        uuid 식별자 PK
        uuid 캔들식별자 FK "UNIQUE"
        text 심볼코드
        text 거래소
        text 타임프레임 "5M/1M"
        vector 임베딩 "202차원"
        text 라벨 "WIN/LOSS/TIME_EXIT"
        text 등급 "A/B/C"
        uuid 시그널식별자 FK "라벨 출처"
    }

    %% ========================================
    %% 트랜잭션 (T) — 주문 실행
    %% ========================================
    티켓 {
        uuid 식별자 PK
        text 심볼코드 FK
        text 거래소 FK
        uuid 시그널식별자 FK "UNIQUE"
        uuid 부모티켓식별자 FK "피라미딩"
        text 타임프레임 "5M/1M"
        text 방향 "LONG/SHORT"
        text 상태 "INITIAL-TP1_HIT-TP2_HIT-CLOSED"
        numeric 진입가
        numeric 손절가
        numeric 현재손절가
        numeric 포지션크기
        numeric 잔여크기
        integer 레버리지
        text 결과 "WIN/LOSS/TIME_EXIT"
        numeric PnL
        numeric 수익률
    }

    주문 {
        uuid 식별자 PK
        uuid 티켓식별자 FK "nullable"
        text 거래소
        text 주문유형 "8가지"
        text 상태 "5가지"
        text 매매방향 "BUY/SELL"
        numeric 실체결가
        numeric 슬리피지
        text 의도식별자
        text 멱등성키
    }

    %% ========================================
    %% 트랜잭션 (T) — 백테스트 + 이력
    %% ========================================
    백테스트 {
        uuid 식별자 PK
        text 실행유형 "BACKTEST/WFO"
        text 심볼코드
        text 거래소
        jsonb 설정스냅샷
        jsonb 결과
        uuid 상위식별자 FK "WFO 구간용"
    }

    이벤트로그 {
        uuid 식별자 PK
        text 이벤트유형 "BIAS_CHANGE/RECONCILIATION/..."
        text 심볼코드
        text 거래소
        uuid 참조식별자
        text 참조유형
        jsonb 데이터
        timestamptz 생성일시
    }

    %% ========================================
    %% 관계 (12개)
    %% ========================================
    심볼 ||--|| 심볼상태 : "1:1 운영상태"
    심볼 ||--o{ 캔들 : "거래소별 시세 수집"
    심볼 ||--o{ 감시세션 : "감시 시작/종료"
    심볼 ||--o{ 시그널 : "시그널 산출"
    심볼 ||--o{ 티켓 : "포지션 보유"

    캔들 ||--o| 벡터 : "마감 시 벡터 생성"
    감시세션 ||--o{ 시그널 : "세션 내 시그널"
    시그널 ||--o{ 시그널상세 : "관측값 key-value"
    시그널 ||--o| 티켓 : "포지션사이저 통과 시"

    티켓 ||--o{ 주문 : "진입/청산 주문"
    티켓 ||--o| 티켓 : "피라미딩 (2차->1차)"
    백테스트 ||--o{ 백테스트 : "WFO 구간"
```

## 핵심 데이터 흐름

```
공통코드 (설정/파라미터)
    │
    ▼ 메모리 캐시 (ConfigStore)
    │
캔들(거래소별 수집) ──→ 감시세션(1H 마감 시 시작)
    │                        │
    ├──→ 벡터(5M/1M 마감시)  │
    │                        ▼
    └──→ 시그널(BB4 터치) ←── 감시세션이 선행
              │
              ├──→ 시그널상세(관측값 key-value)
              │
              ▼
         티켓(체결 시) ──→ 주문(거래소)
              │                │
              ▼                ▼
         벡터.label 확정   이벤트로그(모든 이력)
```

## 변경 이력

> 상세 변경 이력: [../changelogs/ERD_CHANGELOG.md](../changelogs/ERD_CHANGELOG.md)
