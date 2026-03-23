# T-190 implement-credentials-dep

## Goal
`credentialDeps`를 위한 Drizzle CRUD query 함수를 AES-256-GCM 암호화/복호화와 함께 구현하고 `index.ts`에 wiring한다.

## Why
Exchange API key는 DB에 AES-256-GCM으로 암호화되어 저장돼야 한다. `packages/shared/auth/encryption.ts`의 암호화 유틸리티를 재사용하여 구현한다.

## Inputs
- T-188 완료
- `apps/api/src/index.ts` — `credentialDeps` stub 위치 + 인터페이스
- `packages/shared/auth/encryption.ts` — `encrypt`, `decrypt` 함수
- `db/schema/` — credentials 테이블 스키마
- `SECURITY.md` — Exchange API key 보안 규칙

## Dependencies
T-188

## Expected Outputs
- `apps/api/src/db/credentials-queries.ts` — `findByUserId`, `findById`, `create` (encrypt), `update`, `remove`
- `apps/api/src/index.ts` — `credentialDeps` stub 교체

## Deliverables
- `apps/api/src/db/credentials-queries.ts`
- `apps/api/src/index.ts` (수정)

## Constraints
- `create`/`update` 시 API key는 반드시 `MASTER_ENCRYPTION_KEY`로 AES-256-GCM 암호화 후 저장
- `findByUserId`/`findById` 반환값: API key는 마스킹 (`****` 또는 처음 4자만 노출)
- 복호화는 내부 서비스 호출 시에만 (HTTP 응답에 평문 key 절대 포함 금지)
- `MASTER_ENCRYPTION_KEY` 환경변수 필수 — 미설정 시 명확한 에러
- userId 스코프 적용 (다른 사용자의 credential 접근 금지)

## Steps
1. `packages/shared/auth/encryption.ts` 읽기 — 함수 시그니처 확인
2. credentials 테이블 스키마 확인
3. `credentials-queries.ts` 작성:
   - `create`: plaintext key → encrypt → save
   - `findByUserId`: encrypted key → mask
   - `findById`: userId 검증 + mask
   - `update`: re-encrypt
   - `remove`: userId 검증 후 삭제
4. `index.ts` stub 교체
5. `bun run typecheck` 확인

## Acceptance Criteria
- `POST /api/v1/credentials` — encrypted credential이 DB에 저장됨 (평문 없음)
- `GET /api/v1/credentials` — 마스킹된 key만 반환
- `MASTER_ENCRYPTION_KEY` 미설정 시 서버 기동 에러
- 다른 사용자의 credential 접근 → 404 또는 403
- `bun run typecheck` 통과

## Validation
```bash
bun run typecheck
bun test apps/api
# POST /api/v1/credentials 후 DB에서 직접 확인:
# psql $DATABASE_URL -c "SELECT api_key FROM credentials LIMIT 1;" | grep -v "changeme"
```

## Out of Scope
- Key rotation
- Credential 유효성 검증 (실제 거래소 API 호출)
- 다중 암호화 키 지원
