# 업데이트 및 배포

## 9.1 업데이트 절차

### 기본 업데이트

```bash
# 1. 데몬 정상 종료
kill -TERM $(pgrep -f "bun run daemon")

# 2. 소스 업데이트
git pull origin main

# 3. 의존성 업데이트
bun install

# 4. 마이그레이션 (스키마 변경이 있는 경우)
bun run migrate

# 5. 검증
bun test && bun run typecheck

# 6. 데몬 재시작
bun run daemon
```

### 롤백

문제 발견 시:

```bash
# 1. 데몬 정지
kill -TERM $(pgrep -f "bun run daemon")

# 2. 이전 버전으로 복원
git checkout <이전_커밋_해시>

# 3. 의존성 복원
bun install

# 4. 데몬 재시작
bun run daemon
```

## 9.2 CCXT 업데이트 주의사항

CCXT(거래소 API 라이브러리)는 마이너 업데이트로도 거래소 동작이 변경될 수 있습니다.

### 업데이트 전 필수 확인

1. CCXT 체인지로그에서 사용 중인 거래소 관련 변경사항 확인
2. **테스트넷에서 아래 항목 검증**:
   - 주문 실행 (시장가/지정가)
   - SL 등록 및 수정
   - 포지션 조회 (`fetchPositions`)
   - 잔고 조회 (`fetchBalance`)
   - 주문 취소
3. 한 번에 한 거래소씩 테스트
4. 모든 거래소 검증 완료 후 프로덕션 적용

### CCXT 롤백

```bash
# bun.lock에서 이전 버전으로 복원
git checkout bun.lock
bun install
```

## 9.3 라이브 전환 체크리��트

`analysis` → `live` 모드로 전환하기 전 확인 사항:

> 각 지표의 의미는 [백테스트 매뉴얼](./05-backtest.md)에서 상세히 설명합니다.

- [ ] 백테스트 기대값(expectancy) > 0 확인 — 거래 1건당 평균 수익이 양수
- [ ] WFO 효율성 > 0.5 확인 — 학습 성과의 50% 이상이 검증 구간에서 유지됨 (과적합 아님). WFO 자동 파라미터 업데이트가 완료되었고 데몬이 최신 파라미터로 재시작되었는지 확인
- [ ] `analysis` 모드 2주 이상 운영 완료
- [ ] `alert` 모드 2주 이상, 10건 이상 완료 거래 확인
- [ ] Kill Switch 테스트 완료 (테스트넷)
- [ ] Reconciliation 정상 동작 확인 (불일치 없음)
- [ ] Slack 알림 수신 정상 확인
- [ ] 거래소 API 키 권한 확인 (선물만, 출금 없음)
- [ ] 비상 대응 계획 수립 (Kill Switch 접근 가능)
- [ ] DB 백업 완료
- [ ] 경제 캘린더 스케줄러 정상 동작 확인 — 이벤트 조회 및 `trade_block` 등록 로그 확인
- [ ] `execution_mode`를 `live`로 변경

## 9.4 프로세스 관리

### systemd 서비스 (Linux)

프로덕션 환경에서는 systemd로 자동 재시작을 설정합니다.

`/etc/systemd/system/combine-trade.service`:

```ini
[Unit]
Description=combine-trade daemon
After=network.target postgresql.service

[Service]
Type=simple
User=combine
WorkingDirectory=/home/combine/combine-trade
ExecStart=/home/combine/.bun/bin/bun run daemon
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production
EnvironmentFile=/home/combine/combine-trade/.env

[Install]
WantedBy=multi-user.target
```

### systemd 명령어

```bash
# 서비스 등록
sudo systemctl daemon-reload
sudo systemctl enable combine-trade

# 시작/종료/재시작
sudo systemctl start combine-trade
sudo systemctl stop combine-trade
sudo systemctl restart combine-trade

# 상태 확인
sudo systemctl status combine-trade

# 실시간 로그
journalctl -u combine-trade -f

# 최근 100줄 로그
journalctl -u combine-trade -n 100
```

### launchd (macOS)

`~/Library/LaunchAgents/com.combine.trade.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.combine.trade</string>
    <key>ProgramArguments</key>
    <array>
        <string>/Users/combine/.bun/bin/bun</string>
        <string>run</string>
        <string>daemon</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/Users/combine/projects/combine/combine-trade</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/Users/combine/combine-trade.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/combine/combine-trade.err</string>
</dict>
</plist>
```

```bash
# 서비스 등록/해제
launchctl load ~/Library/LaunchAgents/com.combine.trade.plist
launchctl unload ~/Library/LaunchAgents/com.combine.trade.plist

# 상태 확인
launchctl list | grep combine
```

## 9.5 서버 요구사항

| 항목 | 최소 | 권장 |
|------|------|------|
| CPU | 2코어 | 4코어 |
| RAM | 2GB | 4GB |
| 디스크 | 20GB | 50GB (캔들 데이터 성장 고려) |
| 네트워크 | 안정적인 인터넷 | 저지연 연결 (거래소 근접) |
| OS | Linux / macOS | Ubuntu 22.04+ |
