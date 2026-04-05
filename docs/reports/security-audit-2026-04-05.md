# Security Audit — 2026-04-05

## Summary
- Total findings: 6 (Critical: 1, High: 2, Medium: 3)
- Attack surface: 2 public endpoints, 12 authenticated, 0 admin-only
- OWASP categories with findings: A01, A02, A04, A05, A07

## Attack Surface Map

| Type | Count | Examples |
|------|-------|---------|
| Public endpoints | 2 | GET /api/health, POST /api/login (NOT MOUNTED) |
| Authenticated | 12 | GET /api/positions, POST /api/kill-switch, POST /api/transfers/trigger |
| Admin-only | 0 | Single-user system — all authenticated endpoints are "admin" |
| External APIs | 5 | Binance/OKX/Bitget/MEXC CCXT, Slack webhook |
| Data stores | 1 | PostgreSQL (pgvector) |
| File serving | 1 | Static files from ./public |

## Findings

### [CRITICAL] A01-001: Auth routes NOT mounted in production server

- **File**: `src/api/server.ts`
- **Confidence**: 10/10
- **OWASP**: A01 Broken Access Control
- **Exploit scenario**: `createApiServer()` imports all route modules EXCEPT `createAuthRoutes` from `src/api/auth.ts`. The login/logout endpoints exist as dead code. Simultaneously, `jwtSecret` is an optional field in `ApiServerDeps`. If the daemon starts the server without providing `jwtSecret`, the auth guard middleware (line 98-100) is skipped entirely, making ALL endpoints — including `POST /api/kill-switch` (emergency position flatten) and `PUT /api/mode` (execution mode change) — publicly accessible without authentication. The web frontend's `/me` endpoint also does not exist.
- **Remediation**: (1) Import and mount `createAuthRoutes` in `createApiRouter()`. (2) Implement `GET /api/me` endpoint. (3) Make `jwtSecret` required in `ApiServerDeps` (not optional). (4) Verify daemon.ts passes `JWT_SECRET` env var to the server factory.
- **Fix effort**: 30 minutes

### [HIGH] A02-001: JWT cookie missing Secure flag

- **File**: `src/api/auth.ts:82-88`
- **Confidence**: 10/10
- **OWASP**: A02 Cryptographic Failures
- **Exploit scenario**: `buildSetCookie()` sets HttpOnly and SameSite=Strict but omits the `Secure` flag. The cookie will be transmitted over plain HTTP connections. An attacker on the same network (WiFi MITM) can intercept the JWT cookie and gain full authenticated access to trading controls. `docs/SECURITY.md` line 21 documents the policy as "Secure" but the implementation violates it.
- **Remediation**: Add `"Secure"` to the cookie attributes array in both `buildSetCookie()` and `buildClearCookie()`.
- **Fix effort**: 5 minutes

### [HIGH] A07-001: No rate limiting on login endpoint

- **File**: `src/api/auth.ts:139-168`
- **Confidence**: 10/10
- **OWASP**: A07 Authentication Failures
- **Exploit scenario**: `docs/SECURITY.md` line 25 documents "API rate limiting on login endpoint (prevent brute force)" but no rate limiting middleware exists. The login handler calls `Bun.password.verify()` on every request without throttling. A single-user password-only system (no username) reduces the search space. An attacker can make unlimited login attempts. bcrypt/argon2's computational cost slows but does not prevent brute force at scale.
- **Remediation**: Add rate limiter middleware to login route — e.g., 5 attempts per minute per IP, exponential backoff, temporary lockout after 10 failures.
- **Fix effort**: 1 hour

### [MEDIUM] A05-001: `.env.test` committed to git

- **File**: `.env.test`
- **Confidence**: 10/10
- **OWASP**: A05 Security Misconfiguration
- **Exploit scenario**: `.env.test` contains test database credentials (`test:test@localhost:5433`). While currently harmless (test-only), committing `.env*` files normalizes the pattern. A future developer might add real secrets to `.env.test` assuming it's gitignored like `.env`.
- **Remediation**: Add `.env.test` to `.gitignore` and remove from tracking: `git rm --cached .env.test`.
- **Fix effort**: 2 minutes

### [MEDIUM] A05-002: CORS hardcoded to development origin

- **File**: `src/api/middleware.ts:76-83`
- **Confidence**: 9/10
- **OWASP**: A05 Security Misconfiguration
- **Exploit scenario**: CORS origin is hardcoded to `http://localhost:5173` with `credentials: true`. In production, the web UI is served from the same origin (Hono static), so CORS is unnecessary. However, any future origin change risks misconfiguration. If changed to wildcard `*` while `credentials: true` remains, cross-origin credential theft becomes possible.
- **Remediation**: Make CORS origin configurable via env var `CORS_ORIGIN`. In production, set to same-origin or disable CORS entirely.
- **Fix effort**: 15 minutes

### [MEDIUM] A05-003: Dependencies use semver ranges (not pinned)

- **File**: `package.json`
- **Confidence**: 8/10
- **OWASP**: A08 Data Integrity Failures
- **Exploit scenario**: All dependencies use `^` (caret) ranges — e.g., `"ccxt": "^4.5.46"`, `"hono": "^4.12.10"`. A compromised minor/patch release of any dependency would be automatically pulled on `bun install`. `bun.lockb` mitigates this for CI but not for fresh installs.
- **Remediation**: `docs/SECURITY.md` line 49 documents "Pin exact versions in bun.lockb" — the lockfile exists, but `package.json` should also use exact versions for production dependencies (especially `ccxt` which handles exchange API calls). Run `bun install --exact` for new additions.
- **Fix effort**: 15 minutes (one-time migration)

## Positive Controls (Working Correctly)

| Control | Status | Evidence |
|---------|--------|----------|
| Password hashing | OK | `Bun.password.verify()` — bcrypt/argon2 |
| JWT algorithm pinned | OK | `HS256` explicit in both sign() and verify() |
| JWT expiry enforced | OK | 24h expiry, expired tokens → 401 |
| No hardcoded secrets | OK | grep found 0 matches in src/ |
| No `.env` in git | OK | `.gitignore` correctly excludes `.env` |
| SQL injection resistance | OK | All queries via Drizzle ORM (parameterized). `sql` template uses column refs, not user input |
| No command injection | OK | Zero `exec`/`spawn`/`child_process` calls in src/ |
| SSRF resistance | OK | `fetch()` calls use: Slack webhook (from DB/env, not user input), Binance data URL (code-constructed), web frontend (relative paths) |
| Error handler safe | OK | Generic "Internal Server Error" — no stack traces to client |
| CSRF protection | OK | Origin header validation on mutation methods |
| Decimal.js for money | OK | Transfer module uses Decimal exclusively — no float |
| Sensitive data not logged | OK | Logger does not capture API keys, passwords, or tokens |
| EventLog audit trail | OK | TRANSFER_SUCCESS/FAILED/SKIP events recorded with full context |
| Exchange key isolation | OK | API keys only in env vars, never in DB or code |

## STRIDE Summary

| Component | S | T | R | I | D | E |
|-----------|---|---|---|---|---|---|
| API server | ⚠ (F1) | ✓ | ✓ | ✓ | ⚠ (F3) | ⚠ (F1) |
| Auth module | ⚠ (F2) | ✓ | ✓ | ⚠ (F2) | ⚠ (F3) | ✓ |
| Transfer module | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Exchange adapters | ✓ | ✓ | ✓ | ✓ | ✓ | N/A |
| Notifications | ✓ | ✓ | ✓ | ✓ | ✓ | N/A |
| Daemon/Pipeline | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Web frontend | ✓ (React) | ✓ | ✓ | ✓ | ✓ | ✓ |

Legend: ✓=mitigated, ⚠=gap found (Fn=finding #), ✗=unmitigated

## Data Classification

| Data type | Classification | Current protection | Required | Gap |
|-----------|---------------|-------------------|----------|-----|
| Exchange API keys | Restricted | Env vars only | OK | None |
| JWT secret | Restricted | Env var | OK | None |
| DB password | Restricted | Env var | OK | `.env.test` in git (F4) |
| User password | Restricted | bcrypt/argon2 hash | OK | None |
| Account balance | Confidential | Auth-gated API | Conditional (F1) | Auth may be bypassed |
| Trade history | Confidential | Auth-gated API | Conditional (F1) | Auth may be bypassed |
| Transfer amounts | Confidential | EventLog + Auth | OK | None |
| Candle data | Public | No auth needed | OK | None |
| Config (CommonCode) | Internal | Auth-gated API | Conditional (F1) | Auth may be bypassed |

## Recommendations

1. **[CRITICAL] Mount auth routes + require JWT secret** — This is the highest-priority fix. Without it, the entire API is potentially unauthenticated. (~30 min)

2. **[HIGH] Add Secure flag to cookie + login rate limiting** — Two quick wins that close the remaining auth gaps. (~1 hour combined)

3. **[MEDIUM] Git hygiene + CORS config + version pinning** — Lower urgency but important for production readiness. (~30 min combined)

4. **[RECOMMENDED] Security headers** — Add CSP, HSTS, X-Content-Type-Options, X-Frame-Options via Hono middleware. Not a current vulnerability but best practice.

5. **[RECOMMENDED] Re-run this audit after auth fixes** — Verify that all CRITICAL/HIGH findings are resolved before first deployment.
