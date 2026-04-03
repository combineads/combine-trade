# SECURITY.md

## Baseline security posture
This system handles exchange API keys with trading permissions and real funds. Security failures can result in direct financial loss.

## Rules
- Never commit secrets (API keys, passwords, webhook URLs)
- Use environment variables for all credentials
- Validate all external input at API boundaries
- Log actions but never log secrets or full API keys

## Secrets handling
- Exchange API keys: environment variables (`BINANCE_API_KEY`, `BINANCE_API_SECRET`, etc.)
- Database URL: environment variable (`DATABASE_URL`)
- Slack webhook URL: environment variable (`SLACK_WEBHOOK_URL`)
- JWT secret: environment variable (`JWT_SECRET`)
- `.env` file for local development, never committed (`.gitignore`)
- Production: system environment variables or secret manager

## Auth and authorization
- Single-user system: password → JWT (HttpOnly cookie, Secure, SameSite=Strict)
- JWT expiry: 24 hours, refresh on activity
- Web UI: all state-changing endpoints require valid JWT
- No public endpoints except login
- API rate limiting on login endpoint (prevent brute force)

## Exchange API key permissions
- Keys should have futures trading permission only
- No withdrawal permission — ever
- IP whitelist on exchange side when possible
- Separate API keys per exchange

## Data sensitivity
| Data type | Sensitivity | Handling |
|-----------|------------|---------|
| API keys/secrets | Critical | Env vars only, never logged |
| Trade history | Medium | Encrypted at rest (PostgreSQL) |
| Account balance | Medium | Displayed in authenticated UI only |
| Candle data | Low | Public market data |
| Config parameters | Low | Version controlled |

## Input validation
- Web API: validate all request bodies with schema validation
- CommonCode: validate against Zod schema at startup
- Exchange responses: validate expected fields before processing
- Candle data: sanity check (OHLC relationships, timestamp ordering)

## Supply chain hygiene
- Pin exact versions in `bun.lockb`
- Audit dependencies periodically (`bun audit` when available)
- Minimize dependency count — prefer Bun built-ins
- CCXT is the largest dependency — monitor for security advisories
