# Security review

Scope: workshop MVP, simulation only. Reviewed 2026-11-12.

## Assets and trust boundaries

- User strategies, versions, backtests, and share links are tenant data.
- Session cookies and CSRF tokens are credentials.
- The market-data provider and AI provider are untrusted external inputs.
- The browser is untrusted for authorization decisions; every check is server-side.

## Controls

| Area             | Control                                                                                                                                                          | Evidence                                                           |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Authentication   | Email + password, scrypt (N=16384, r=8, p=1, 64-byte key), unique salt, timing-safe compare                                                                      | `packages/auth/src/password.ts`                                    |
| Session          | 32-byte random token, SHA-256 stored in DB, 14-day expiry, HTTP-only `SameSite=Lax` cookie, `Secure` in production                                               | `packages/auth`, `.env.example`                                    |
| CSRF             | Double-submit cookie + `x-csrf-token` header on every authenticated mutation; trusted-origin check on all mutations                                              | `apps/api/src/app.ts`; integration test “rejects CSRF…”            |
| Authorization    | Every strategy/version/backtest lookup is scoped by `user_id`; cross-user requests return 404, not existence leaks                                               | `packages/db/src/store.ts`; integration test “enforces ownership…” |
| Share links      | 192-bit random token, only SHA-256 stored, expiry, revocable, no account data in response, noindex web page                                                      | `apps/api/src/app.ts`; test “signs up … serves results”            |
| Rate limits      | Generate 5/hour + 20/day/user, backtest 10/hour + 50/day/user, global caps, auth 20/15min/IP; DB-backed atomic counters                                          | `packages/config`, `packages/db`, integration test for 429         |
| Resource limits  | Max 20,000 candles, max body 256 KB (generation) / 64 KB (other), prompt 4,000 chars, trade page 100, equity downsample 2,000                                    | `packages/config`, `apps/api/src/app.ts`                           |
| Input validation | Zod strict objects at every API boundary; StrategySpec strict recursive schema + semantic validator                                                              | `packages/contracts`, `packages/strategy-spec`                     |
| SQL injection    | Parameterized SQL only; no string interpolation of user values                                                                                                   | `packages/db/src/store.ts`                                         |
| XSS              | React escaping; no `dangerouslySetInnerHTML` except the static theme bootstrap script; CSP on API; Caddy headers                                                 | `apps/web/src/app/layout.tsx`, `infra/caddy/Caddyfile`             |
| Clickjacking     | `X-Frame-Options: DENY`, `frame-ancestors 'none'`                                                                                                                | API middleware, Caddy                                              |
| Transport        | Caddy TLS; HSTS; secure cookies in production                                                                                                                    | `infra/caddy/Caddyfile`, compose                                   |
| Error safety     | Stable error codes, request IDs, no raw provider/DB messages to users                                                                                            | `apps/api/src/app.ts`                                              |
| AI boundary      | LLM output is untrusted; Zod + semantic validation; one repair pass; template fallback; no code execution                                                        | `packages/ai`                                                      |
| Prompt privacy   | Full prompts are not logged; generation audit stores a SHA-256 of the prompt and token counts. Strategies store the source prompt deliberately for traceability. | `packages/ai/src/service.ts`, `store.insertGeneration`             |
| Exchange safety  | No exchange API keys, withdrawal, order placement, or custody code paths exist                                                                                   | repository search; `no exchange` tests                             |
| Secrets          | Only names in `.env.example`; no secrets committed                                                                                                               | `.env.example`, `.gitignore`                                       |
| Logging          | Structured JSON request logs without cookies, prompts, or passwords                                                                                              | `apps/api/src/app.ts`                                              |

## Threat model highlights

- **IDOR**: tests create two users and attempt strategy read, version write, backtest read, trades
  read, and share creation as the second user. All return 404.
- **CSRF**: missing `x-csrf-token` returns 403; untrusted `Origin` returns 403. `SameSite=Lax` is a
  second layer, not the only control.
- **Session theft**: tokens are random, hashed at rest, HTTP-only, and expire. No localStorage
  token. Logout deletes the server session.
- **Share leakage**: public responses contain result, assumptions, and expiry only. Owner email and
  ID are not returned.
- **Rate-limit abuse**: counters are atomic in Postgres and scoped per user and global. Auth has a
  separate IP bucket.
- **Expensive backtests**: date range is bounded before enqueue; worker also rejects >20k candles;
  one running job per user is enforced at submission.
- **AI prompt injection**: the system prompt treats the description as data and forbids policy
  changes; template fallback ignores injected instructions. Acceptance includes two injection cases.

## Deliberate deviations / residual risks

- **Auth implementation**: Better Auth was the target, but the Phase 0 spike could not be validated
  under the target Bun/Postgres environment here. The implementation uses the documented minimal
  session fallback with the same `getSession`/`requireUser` contract. Password hashing, cookies,
  expiry, logout, and tenant isolation are test-covered.
- No email verification, password reset, MFA, or account lockout beyond rate limits. These are not
  in the workshop MVP; provision accounts manually if needed.
- CSRF token is per sign-in, not rotated per request. A stolen CSRF cookie is not sufficient without
  the session cookie, but consider per-request tokens before a public launch.
- App-level ownership checks, not Postgres RLS. Keep all access through the store layer.
- Dependency vulnerability scan (`bun audit`/`npm audit`) was not run in this offline build; run it
  on staging and before release.
- Browser-based axe, Lighthouse, and screenshot checks require a working Chromium runtime; this
  environment’s Chromium binary is not runnable. Static design and accessibility checks pass
  (`docs/evidence/design-check.json`), but the visual gate must be completed on staging.

## Security test commands

```bash
bun run test
bun run typecheck
bun run scripts/design-check.ts
```

The integration suite exercises CSRF, origins, ownership, rate limits, payload bounds, share
access, and security headers. Do not ship a build where these tests fail.
