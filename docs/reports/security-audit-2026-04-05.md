# Security Audit — 2026-04-05

## Summary
- Total findings: 11 (Critical: 1, High: 3, Medium: 7)
- Attack surface: 2 public endpoints, 12 authenticated, 0 admin-only
- OWASP categories with findings: A01, A02, A04, A05, A06, A07, A08, A09
- 3-agent parallel audit: Auth/Surface, Injection/SSRF/Data, Config/Deps/DoS/STRIDE

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

### [HIGH] A05-004: No HTTP security headers (CSP, X-Frame-Options, HSTS)

- **File**: `src/api/server.ts`
- **Confidence**: 10/10
- **OWASP**: A05 Security Misconfiguration
- **Exploit scenario**: No `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, or `Strict-Transport-Security` headers are set. An attacker hosts a malicious page that embeds the dashboard in an `<iframe>` (clickjacking). The operator is tricked into clicking the kill-switch button or switching execution mode to "live" while believing they are interacting with a different page.
- **Remediation**: Add Hono `secureHeaders` middleware or manually set: `X-Frame-Options: DENY`, `Content-Security-Policy: frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`.
- **Fix effort**: 15 minutes

### [MEDIUM] A04-001: No request body size limit (DoS)

- **File**: `src/api/server.ts`
- **Confidence**: 9/10
- **OWASP**: A04 Insecure Design
- **Exploit scenario**: No `bodyLimit` middleware. `POST /api/login` (public, no auth) with a 500 MB JSON payload → Bun reads entire body into memory → heap exhaustion → daemon crash. Since daemon is single-process (trading pipeline + reconciliation + API), this crashes the entire system.
- **Remediation**: Add Hono `bodyLimit` middleware globally (1 MB max).
- **Fix effort**: 5 minutes

### [MEDIUM] A06-001: No dependency vulnerability audit tool

- **Confidence**: 10/10
- **OWASP**: A06 Vulnerable Components
- **Exploit scenario**: `bun audit` does not exist. `npm audit` fails (no npm lockfile). Known CVEs in `jsonwebtoken`, `ccxt`, or transitive dependencies go undetected. `SECURITY.md` says "Audit dependencies periodically" but provides no mechanism.
- **Remediation**: Add `osv-scanner` or `snyk` to CI. Alternatively, generate `package-lock.json` alongside `bun.lock` for `npm audit`.
- **Fix effort**: 30 minutes

### [MEDIUM] A09-001: TransferScheduler bypasses structured logger

- **File**: `src/transfer/scheduler.ts:167,182`
- **Confidence**: 10/10
- **OWASP**: A09 Logging Failures
- **Exploit scenario**: TransferScheduler uses `console.log`/`console.error` instead of `createLogger()`. Transfer errors are missed by log aggregation pipelines (which parse JSON lines). `console.error(err)` may print stack traces with file paths.
- **Remediation**: Replace with `createLogger("transfer-scheduler").info(...)` and `.error(...)`.
- **Fix effort**: 10 minutes

### [MEDIUM] A09-002: Logger has no sensitive-value scrubbing

- **File**: `src/core/logger.ts`
- **Confidence**: 8/10
- **OWASP**: A09 Logging Failures
- **Exploit scenario**: Logger accepts arbitrary `Record<string, unknown>` and serializes via `JSON.stringify`. No deny-list for keys like `password`, `secret`, `apiKey`. Currently no caller passes secrets, but no guardrail prevents future callers from doing so.
- **Remediation**: Add deny-list filter in `buildEntry()` that redacts keys matching `/password|secret|apiKey|apiSecret|token|authorization/i`.
- **Fix effort**: 30 minutes

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

## Full Finding Index

| # | Severity | OWASP | Title | Confidence |
|---|----------|-------|-------|------------|
| A01-001 | CRITICAL | A01 | Auth routes not mounted + jwtSecret optional | 10/10 |
| A02-001 | HIGH | A02 | JWT cookie missing Secure flag | 10/10 |
| A07-001 | HIGH | A07 | No rate limiting on login/transfer/kill-switch | 10/10 |
| A05-004 | HIGH | A05 | No HTTP security headers (clickjacking) | 10/10 |
| A05-001 | MEDIUM | A05 | .env.test committed to git | 10/10 |
| A05-002 | MEDIUM | A05 | CORS hardcoded to dev origin | 9/10 |
| A05-003 | MEDIUM | A08 | Dependencies use ^ ranges | 8/10 |
| A04-001 | MEDIUM | A04 | No request body size limit (DoS) | 9/10 |
| A06-001 | MEDIUM | A06 | No dependency vulnerability audit tool | 10/10 |
| A09-001 | MEDIUM | A09 | TransferScheduler bypasses structured logger | 10/10 |
| A09-002 | MEDIUM | A09 | Logger has no sensitive-value scrubbing | 8/10 |

## Recommendations

1. **[CRITICAL] Mount auth routes + require JWT secret** — Highest priority. Without it, the entire API is unauthenticated. (~30 min)

2. **[HIGH] Security headers + Secure cookie flag** — Add secureHeaders middleware + Secure flag on JWT cookie. (~20 min combined)

3. **[HIGH] Rate limiting on critical endpoints** — Login (5/min), transfer trigger (1/min), kill-switch (1/min). (~1 hour)

4. **[MEDIUM] Body size limit** — Add `bodyLimit(1MB)` middleware globally. (~5 min)

5. **[MEDIUM] Structured logging fix** — Replace console.log in scheduler, add logger scrubbing. (~40 min)

6. **[MEDIUM] Git hygiene + CORS config + version pinning** — Lower urgency but production-blocking. (~30 min)

7. **[RECOMMENDED] Re-run this audit after CRITICAL/HIGH fixes** — Verify resolution before deployment.
