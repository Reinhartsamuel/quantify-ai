# Release gate

Release: workshop MVP 0.1.0. Evidence recorded 2026-11-12.

Status: **Conditional pass** — technical gates are green; browser-based visual/accessibility review
and the non-technical usability rehearsal must be completed on staging before the workshop.

| Gate                                                     | Status  | Evidence                                                            |
| -------------------------------------------------------- | ------- | ------------------------------------------------------------------- |
| Prompt → generate → edit → save → backtest → read result | Pass    | `bun run test` product-loop integration test                        |
| Deterministic engine output                              | Pass    | Engine test “bit-for-bit deterministic”; demo fixture evidence      |
| No look-ahead                                            | Pass    | Engine test “does not look ahead when future candles change”        |
| Fees/slippage/stop/take/end-of-data                      | Pass    | Engine tests                                                        |
| No cross-user access                                     | Pass    | Integration test “enforces ownership…”                              |
| CSRF, origin check, cookie flags                         | Pass    | Integration test “rejects CSRF…”; auth package                      |
| Rate limits                                              | Pass    | Integration test “enforces per-user generation rate limits”         |
| Input and range bounds                                   | Pass    | Integration tests; config limits                                    |
| Share is read-only, revocable, no account data           | Pass    | Integration test; public share response                             |
| Indodax snapshot verified                                | Pass    | `bun run data:verify`; 0 gaps, hashes match                         |
| Fixture vs live demo identical                           | Pass    | `docs/evidence/demo-fixture.json`                                   |
| AI contract + fallback                                   | Pass    | `docs/evidence/ai-acceptance.json` (100% valid specs)               |
| AI preflight                                             | Pass    | `bun run ai:preflight` template mode                                |
| Load profile 45 users                                    | Pass    | `docs/evidence/load-test.json` (0 errors)                           |
| Typecheck and production web build                       | Pass    | `bun run typecheck`; `next build --webpack`                         |
| Static design/anti-slop checks                           | Pass    | `docs/evidence/design-check.json`                                   |
| `sloplint --render`                                      | Not run | Hallmark/sloplint not installed in this environment; run on staging |
| axe-core browser audit                                   | Not run | No runnable Chromium on this host; run on staging                   |
| Screenshots at 375/768/1024/1440, both themes            | Not run | Same browser limitation; required before sign-off                   |
| Non-technical usability rehearsal (3–5 users)            | Pending | Protocol in `docs/usability-rehearsal.md`                           |
| Restore drill                                            | Pending | Script ready; run against staging Postgres and record output        |
| Offsite backup configured                                | Pending | Configure `BACKUP_S3_BUCKET` or `BACKUP_RCLONE_REMOTE`              |
| Workshop date/cohort/post-event access confirmed         | Pending | BlockDev.id confirmation                                            |
| Facilitator demo rehearsed on production                 | Pending | Follow `docs/workshop.md` T-1 checklist                             |

## Hard failures — must not ship

- Any failing test in `bun run test`.
- Any cross-user response that is not 401/404.
- Any backtest whose output hash differs between two identical runs.
- Any displayed result without assumptions and the simulation disclosure.
- Any claim of guaranteed returns or invented statistics/testimonials.
- A broken 375 px layout, invisible focus, or reduced-motion preference being ignored.
- Secrets committed to the repository.

## Sign-off

- Engineering: technical gates above pass on this commit.
- Design/accessibility: **pending** browser run + fresh-context review.
- Product/facilitator: **pending** usability rehearsal and production demo.
- Operations: **pending** backup/restore drill and offsite copy.

Do not present the platform as the primary hands-on tool until the pending gates are signed off.
The fixture snapshot and screenshot fallback remain available.
