# T-138 Wire credential routes into API server

## Goal
`apps/api/src/server.ts`에 credential 라우트를 연결하고, DB 기반 Drizzle repository를 의존성으로 주입한다.

## Why
T-121(API server bootstrap)에서 credential 라우트 wiring이 누락됐다.
`credentialRoutes` 팩토리와 `exchange_credentials` DB 스키마는 이미 존재하지만
`createApiServer()`에 마운트되지 않아 엔드포인트가 실제로 동작하지 않는다.
현재 Binance API 키는 `.env`로 임시 관리 중이며, 이 태스크 완료 후 DB 암호화 저장으로 전환 가능해진다.

## Dependencies
- T-121 (API server bootstrap — server.ts 존재)
- T-081 (AES-256-GCM 암호화 서비스)
- T-082 (credentialRoutes 팩토리)

## Inputs
- `apps/api/src/server.ts` — createApiServer() 함수
- `apps/api/src/routes/credentials.ts` — credentialRoutes 팩토리 + CredentialRouteDeps
- `db/schema/exchange-credentials.ts` — exchangeCredentials Drizzle 스키마
- `packages/shared/crypto/encryption.ts` — encrypt/decrypt 함수

## Expected Outputs
- `apps/api/src/server.ts` — credentialRoutes 마운트 추가
- `apps/api/src/deps.ts` (또는 bootstrap) — credential DB repository 함수 구현
- `apps/api/__tests__/credentials-wiring.test.ts` — wiring 통합 테스트

## Deliverables

### 1. Drizzle credential repository 함수
`CredentialRouteDeps`의 4개 함수를 Drizzle로 구현:
- `findByUserId(userId)` → `exchange_credentials` WHERE user_id = userId
- `findById(id)` → `exchange_credentials` WHERE id = id
- `create(input)` → INSERT INTO `exchange_credentials`
- `update(id, input)` → UPDATE `exchange_credentials`
- `remove(id)` → DELETE FROM `exchange_credentials`

### 2. server.ts wiring
```typescript
import { credentialRoutes } from "./routes/credentials.js";

// createApiServer()에 추가
.use(credentialRoutes({
  masterKey: deps.masterEncryptionKey,
  findByUserId: deps.credentialDeps.findByUserId,
  findById: deps.credentialDeps.findById,
  create: deps.credentialDeps.create,
  update: deps.credentialDeps.update,
  remove: deps.credentialDeps.remove,
}))
```

### 3. ApiServerDeps 타입 확장
```typescript
credentialDeps: CredentialRouteDeps 중 DB 함수들
```

## Acceptance Criteria
- `POST /api/v1/credentials` — API 키 등록 시 DB에 암호화 저장
- `GET /api/v1/credentials` — 목록 조회 (암호화된 값 노출 금지, 마스킹)
- `PUT /api/v1/credentials/:id` — label/isActive 수정
- `DELETE /api/v1/credentials/:id` — 삭제
- 인증 없는 요청 → 401 (auth middleware 적용)
- masterEncryptionKey 없이 복호화 불가

## Validation
```bash
bun test apps/api/__tests__/credentials.test.ts
bun test apps/api/__tests__/credentials-wiring.test.ts
bun run typecheck
```

## Out of Scope
- 복호화 후 CCXT 주입 (별도 태스크)
- master key 로테이션 CLI (T-147a)
- UI credential 관리 페이지
