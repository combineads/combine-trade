# T-19-009 CommonCode 웹 수정 API

## Metadata
- modules: [api, config]
- primary: api

## Goal
`PUT /common-code/:groupCode/:code` 엔드포인트를 추가하여 웹 인터페이스에서 CommonCode 값을 수정할 수 있게 한다. ANCHOR 그룹 수정 시도는 거부하고, 성공 시 `refreshConfig()`를 호출하여 인메모리 캐시를 갱신한다.

## Why
현재 CommonCode 값은 DB에 직접 접근하거나 seed 재실행으로만 변경 가능하다. PRD §3(L43)은 웹 UI에서 KNN 파라미터, FEATURE_WEIGHT 등 튜닝 값을 실시간으로 수정할 수 있는 REST API를 요구한다. `config/index.ts`에 `updateConfig()` 함수는 이미 존재하므로, API 라우트만 추가하면 된다.

## Inputs
- `src/api/routes/config.ts` — 기존 GET /config 라우트
- `src/config/index.ts` — `updateConfig()`, `refreshConfig()`, `AnchorModificationError`
- `src/api/server.ts` — 라우터 마운트 위치
- PRD §3 L43

## Dependencies
- 없음 (독립 수정)

## Expected Outputs
- 수정된 `src/api/routes/config.ts` — PUT 엔드포인트 추가
- 수정된 `src/api/server.ts` 또는 마운트 파일 (필요 시)
- 신규 또는 갱신된 테스트 파일

## Deliverables
- `src/api/routes/config.ts`:
  - `PUT /common-code/:groupCode/:code` 라우트 추가
  - 요청 바디: `{ value: unknown }`
  - ANCHOR 그룹 → 400 `{ error: "ANCHOR_GROUP_MODIFICATION_REJECTED", group: groupCode }`
  - 코드/값 미존재 → 404 `{ error: "CONFIG_NOT_FOUND" }`
  - 유효하지 않은 값 → 422 `{ error: "INVALID_CONFIG_VALUE", message: "..." }`
  - 성공 → `updateConfig(groupCode, code, value)` 호출 후 `refreshConfig()` 호출, 200 `{ group: groupCode, code, value }`
  - `ConfigDeps`에 `updateConfig`, `refreshConfig` dep 추가
- `tests/api/routes/config.test.ts` (신규 또는 확장):
  - 정상 수정, ANCHOR 거부, 미존재 코드, 유효하지 않은 값 시나리오

## Constraints
- `updateConfig()`는 이미 ANCHOR 그룹을 `AnchorModificationError`로 거부함 — 라우트에서 에러 타입을 catch하여 400 응답
- `refreshConfig()`는 `updateConfig()` 성공 후 반드시 호출
- 인증/인가는 기존 미들웨어에 위임 (이 태스크에서 추가 인증 로직 없음)
- 요청 바디의 `value` 필드는 JSON 타입 제한 없음 (`unknown`) — 실제 검증은 `validateConfigValue()`에서 수행
- `bun run typecheck` 통과

## Steps
1. Write test code from ## Test Scenarios (RED phase)
2. Run tests — confirm all behavioral tests fail
3. `ConfigDeps` 타입에 `updateConfig`, `refreshConfig` 선택적 dep 추가
4. `createConfigRoutes()` 내 `PUT /common-code/:groupCode/:code` 핸들러 구현:
   - 바디 파싱 → `updateConfig()` 호출
   - `AnchorModificationError` catch → 400
   - `ConfigNotFoundError` catch → 404
   - 유효성 오류 catch → 422
   - 성공 시 `refreshConfig()` 호출 → 200 응답
5. Run tests — confirm all pass (GREEN phase)
6. Refactor while keeping tests green (REFACTOR phase)

## Acceptance Criteria
- [x] `PUT /common-code/KNN/top_k` with `{ value: 10 }` → 200, value updated, refreshConfig called
- [x] `PUT /common-code/ANCHOR/bb_period` → 400 `ANCHOR_GROUP_MODIFICATION_REJECTED`
- [x] `PUT /common-code/KNN/nonexistent_code` → 404 `CONFIG_NOT_FOUND`
- [x] `PUT /common-code/KNN/top_k` with `{ value: "not_a_number" }` → 422 `INVALID_CONFIG_VALUE`
- [x] 성공 응답 바디: `{ group, code, value }` 포함
- [x] `bun run typecheck` 통과

## Test Scenarios
- PUT /common-code/KNN/top_k with valid numeric value → 200, updateConfig called with (KNN, top_k, value)
- PUT /common-code/KNN/top_k success → refreshConfig called after updateConfig
- PUT /common-code/ANCHOR/bb_period → 400, updateConfig throws AnchorModificationError
- PUT /common-code/KNN/missing_code → 404, updateConfig throws ConfigNotFoundError
- PUT /common-code/KNN/top_k with invalid value type → 422
- PUT /common-code/FEATURE_WEIGHT/w_squeeze with valid value → 200
- Response body on success contains { group: "KNN", code: "top_k", value: <updated> }

## Validation
```bash
bun test tests/api/routes/config.test.ts
bun run typecheck
```

## Out of Scope
- GET /common-code 목록 조회 API (별도 요건)
- DELETE /common-code 삭제 엔드포인트
- CommonCode 그룹 생성 API
- 인증/인가 로직 추가 (기존 미들웨어 사용)
