# SECURITY.md

## Baseline security posture
Single-user system, but real funds are at stake. Exchange API keys and the order execution path are the highest-priority protection targets.

## Rules
- Never commit secrets (API keys, webhook URLs, DB credentials)
- Strategy sandbox must not access secrets or external resources
- All exchange API calls through authenticated adapter only
- Order execution path requires decision engine approval

## Secrets handling
- Exchange API keys: stored in DB with AES-256-GCM encryption (master key in environment variable)
- Exchange key retrieval: masked on read (`sk-****...1234`), decrypted in memory only at execution time
- better-auth session secret: environment variable `BETTER_AUTH_SECRET` (never stored in code or DB)
- `.env` file: included in `.gitignore`, never committed
- Slack webhook URL: environment variable
- DB connection credentials: environment variable
- Strategy code is stored in DB but has no direct access to exchange keys

#### Encryption specification
- **Algorithm**: AES-256-GCM
- **Master key**: Environment variable `MASTER_ENCRYPTION_KEY`
- **Key derivation**: Master key passphrase → PBKDF2-SHA256 (600,000 iterations, 32-byte salt per credential) → 256-bit AES key. Per OWASP 2025 guidelines for PBKDF2-SHA256.
- **Nonce**: Random 96-bit (12 bytes) generated per encryption operation via crypto.getRandomValues()
- **Storage format**: `base64(salt || nonce || ciphertext || authTag)` — salt (32 bytes) + nonce (12 bytes) + ciphertext (variable) + authentication tag (16 bytes)
- **Authentication tag**: 128-bit, appended to ciphertext
- **Key rotation procedure**:
  1. Generate new master key passphrase
  2. Decrypt all credentials with old key
  3. Re-encrypt all credentials with new key in a single transaction
  4. Update environment variable
  5. Verify decryption with new key
  6. Audit log the rotation event (without logging key material)

## Exchange API key requirements
- Withdrawal permission: MUST be disabled (system only performs trading)
- IP whitelist: server IP only (configured on exchange side)
- Registration UI must enforce "withdrawal disabled" confirmation checkbox
- Trade-only permissions: spot/futures trading + balance read

## Strategy sandbox isolation
- Strategy code runs in sandbox: no direct DB/network/filesystem access
- Only provided API available (candle data, technical indicators, timeframe)
- Execution time limit: 5 seconds
- Memory limit: configured per worker
- Malicious code prevention: eval/import/require restricted

### Blocked APIs (static analysis + runtime enforcement)
- eval(), Function(), new Function()
- import, require, import() (dynamic)
- globalThis, window, global, self
- process, child_process, fs, net, http, https
- SharedArrayBuffer, Atomics
- Proxy on built-in prototypes (prototype pollution prevention)
- Object.defineProperty on frozen objects
### Runtime enforcement
- Global object freeze (Object.freeze on sandbox globals)
- Sandbox escape test suite mandatory (escape attempt tests included in CI)
- Isolation mechanism: determined by EP02-M0 PoC (Bun worker threads vs V8 isolates)

## Auth and authorization

> **Implementation**: better-auth (EP18). `docs/exec-plans/10-auth.md` is retained for historical reference only.

- All API endpoints require authentication (real funds at stake — auth is mandatory even for single user)
- Authentication mechanism: better-auth cookie-based sessions (server-managed)
- Exempt endpoints: `GET /api/v1/health`, `/api/auth/*` (better-auth managed endpoints)
- Next.js web and Tauri app: sessions stored in `HttpOnly; SameSite=Strict` cookies
- SSE streaming: session validated on initial connection via `auth.api.getSession()`
- Session implementation: `packages/shared/auth/better-auth.ts` (factory), wired in `apps/api/src/server.ts`

### better-auth session model

#### Session flow
1. Client POSTs credentials to `POST /api/auth/sign-in/email`
2. better-auth validates credentials, creates a server-side session record in the DB
3. Session token returned as `HttpOnly; SameSite=Strict` cookie with prefix `combine-trade`
4. All subsequent requests include the cookie automatically (browser) or explicitly (Tauri/API client)
5. Server validates session on every request via `auth.api.getSession({ headers })`
6. On logout (`POST /api/auth/sign-out`), session is invalidated in the DB

#### Cookie configuration
- **Prefix**: `combine-trade` (configurable via `advanced.cookiePrefix`)
- **Flags**: `HttpOnly`, `SameSite=Strict`, `Secure` (in production)
- **Storage**: session tokens stored server-side in the `session` table

#### CORS configuration
- `ALLOWED_ORIGIN` environment variable controls the permitted origin (default: `http://localhost:3001`)
- Wildcard `*` is prohibited; explicit origin allowlist only
- Credentials mode enabled (`credentials: true` in CORS config)

#### Rate limiting
| Endpoint | Limit | Window |
|----------|-------|--------|
| `POST /api/auth/sign-in/email` | 5 attempts | per minute |
| General API | 100 requests | per minute |

- Exceeded limit returns `429 Too Many Requests` with `Retry-After` header
- better-auth has built-in rate limiting; additional application-level guards are in `apps/api/src/server.ts`

### Password hashing specification
- **Algorithm**: Argon2id (recommended variant)
- **Memory**: 64 MB
- **Iterations**: 3
- **Parallelism**: 4
- **Salt**: 16 bytes random

## Order execution safety
- All orders must go through decision engine judgment
- Pre-order validation: symbol, quantity, price range
- Duplicate order prevention: client_order_id based
- Kill switch: emergency stop mechanism (manual + automatic)
- Daily loss limit: auto-trade suspended when exceeded

#### Kill switch specification
- **State storage**: `kill_switch_state` database table (persists across restarts)
- **Propagation mechanism**: PostgreSQL LISTEN/NOTIFY on `kill_switch_activated` channel. All execution-workers subscribe on startup.
- **Propagation latency**: Must reach all workers within 1 second (Critical Invariant #6)
- **Scope**: Global (all strategies) or per-strategy
- **On activation**:
  - Cancels all queued unsubmitted orders (orders pending local processing that have not yet been sent to the exchange)
  - Prevents all new order submissions from this point forward
  - Does NOT cancel already-submitted exchange orders (orders already on the exchange order book are left untouched; cancellation is a separate explicit action to avoid unintended position changes)
  - Logs activation event with timestamp, trigger source (manual/automatic), and reason
- **On restart**: System checks kill switch state on boot. If active, boots in halted state.
- **Defense against NOTIFY loss**: Every order submission must verify kill switch state via direct DB query (`SELECT active FROM kill_switch_state`) before proceeding, regardless of NOTIFY subscription status. This provides a synchronous safety net independent of the async LISTEN/NOTIFY channel.
- **Manual override**: Only authenticated user can activate/deactivate via API or UI

#### Daily loss limit specification
- **Time window**: UTC day boundary (00:00 UTC). Configurable via `reset_hour` setting.
- **PnL calculation**: Based on realized PnL only (closed positions). Unrealized PnL is tracked separately for display.
- **Scope**: Per-strategy AND global. Global breach suspends all auto-trade. Per-strategy breach suspends that strategy only.
- **Breach behavior**: Immediately sets execution mode to `analysis` for affected strategies. Existing open positions are NOT automatically closed.
- **Re-enablement**: Manual only. Requires authenticated user action. Audit logged.
- **Configuration**: `daily_loss_limits` table with `strategy_id` (nullable for global), `limit_amount` (Decimal), `reset_hour` (integer, default 0).

## Audit trail
- All order executions: decision → order → fill chain recorded with timestamps
- Exchange key management: register/delete/view events logged (actor, timestamp)
- Authentication events: login attempts (success/fail), token issue/revoke
- Kill switch: activation/deactivation with trigger reason
- Configuration changes: execution mode, risk limits, strategy active status
- Audit logs are append-only (DELETE/UPDATE prohibited on audit tables)
- Retention: minimum 2 years (aligned with ARCHITECTURE.md data retention policy)

## Input validation
- Strategy code: TypeScript parsing validation before save
- API input: Elysia schema validation (type-safe)
- Exchange responses: validated against expected schema before processing

### SQL injection prevention
- DrizzleORM: parameterized queries (default protection)
- Dynamic vector tables (raw SQL exception):
  - strategy_id and version must be validated as integer/UUID before use
  - Table name construction: whitelist pattern validation (^vectors_[a-f0-9-]+_v\\d+$)
  - No string concatenation for SQL construction — template literals with validated params only
  - Single access point through VectorTableManager (ARCHITECTURE.md policy)

## API rate limiting

| Endpoint category | Limit | Window |
|-------------------|-------|--------|
| `POST /api/auth/login` | 5 requests | per minute |
| `POST /api/auth/refresh` | 10 requests | per minute |
| General API | 100 requests | per minute |
| `POST /api/backtest` | 2 concurrent | — |
| `POST /api/strategies` | 20 requests | per minute |
| Internal order execution | 10 orders | per strategy per minute |
| Same-symbol re-order cooldown | per symbol | 5 seconds |

### Order size and position caps
- **Single order size limit**: Maximum notional value per order is configurable (default: $10,000). Orders exceeding this limit are rejected before submission.
- **Maximum position size per strategy**: Configurable per strategy (default: 10% of total balance). Evaluated at order time against current open positions.
- **Anomaly detection**: Alert on >3 same-direction orders for the same symbol within 1 minute from any single strategy. Triggers Slack alert and pauses that strategy pending operator review.

- Rate limiting is per-IP (single user, but protects against accidental loops)
- Exceeded limit returns `429 Too Many Requests` with `Retry-After` header
- Backtest has concurrency limit (not rate limit) to prevent resource exhaustion

### SSE connection limits
- Maximum 3 concurrent SSE connections per client
- New connection beyond limit closes the oldest connection
- Reconnection with `Last-Event-ID` header for seamless recovery

## Data sensitivity

| Data | Sensitivity | Protection |
|------|-------------|------------|
| Exchange API keys | Critical | DB AES-256-GCM encrypted (master key in env), never logged |
| Session tokens (better-auth) | Critical | HttpOnly cookie, server-side session in DB, never logged |
| Master encryption key | Critical | Environment variable, never logged |
| Order/position data | High | DB access control |
| User password hash | High | DB stored, Argon2id (memory: 64 MB, iterations: 3, parallelism: 4, salt: 16 bytes) |
| Decision audit logs | High | Append-only, no deletion |
| Strategy code | Medium | DB stored, backed up |
| Slack webhook URL | Medium | Environment variable, never logged |
| Candle data | Low | Public data |
| Vectors/statistics | Low | Internal derived data |

## SSRF protection
- Exchange adapter: CCXT instance base URLs hardcoded or allowlist-only (no user-configurable URLs)
- Slack webhook: URL format validation (https://hooks.slack.com/* only)
- Strategy sandbox: network access completely blocked at runtime level
- Internal network addresses blocked for all outbound requests:
  - IPv4 loopback: `127.0.0.1`
  - Private ranges: `10.x`, `172.16-31.x`, `192.168.x`
  - IPv6 loopback: `::1`
  - Link-local: `169.254.x.x`, `fe80::/10`
  - DNS rebinding prevention: resolve hostname before request, verify resolved IP is not in blocked ranges

## Security configuration
- CORS: explicit origin allowlist (wildcard * prohibited)
  - Development: localhost:3000 (Next.js dev server)
  - Production: deployment domain only
- Security headers: Strict-Transport-Security, X-Content-Type-Options, X-Frame-Options
- Cookie settings: Secure, HttpOnly, SameSite=Strict (for refresh tokens)

#### CSRF mitigation
- Sessions use `SameSite=Strict` cookies — browsers will not send the session cookie on cross-site requests
- better-auth's built-in CSRF protection validates `Origin` and `Referer` headers on state-changing requests
- `SameSite=Strict` on all session cookies

#### TLS enforcement
- All production traffic must be served over HTTPS (TLS 1.2+)
- TLS termination may be delegated to a reverse proxy (nginx, Caddy) or handled directly
- HTTP → HTTPS redirect enforced at infrastructure level
- `Strict-Transport-Security` header with `max-age=31536000; includeSubDomains`

## Logging — sensitive data exclusion
- Never logged: API keys, API secrets, JWT tokens, password hashes, master encryption key
- Masked before logging: user email (partial), strategy source code (truncated)
- Structured logging auto-filter layer recommended for production

## Supply chain hygiene
- Commit `bun.lockb` to pin dependencies
- Dependency audit: use `npx audit-ci` or equivalent (Bun does not natively support `audit`)
- Remove unused packages immediately
- Validate exchange compatibility on CCXT updates
