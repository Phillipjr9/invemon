# Server-backed goal planning

Dashboard route: `#dashboard?section=goals`. API: `/api/goals`. Requires **011_customer_goals.sql** and the existing numbered schema. Not applied to hosted Neon or deployed by this change.

## Implemented

- Create, edit, archive and restore personal goal plans, persisted against the authenticated server user.
- Goal name, USD target, intended monthly USD amount and target date. Amounts use integer cents via BigInt/string conversion and exact database numerics. Target must be positive; monthly intention can be zero. Dates must be real calendar dates from UTC today through 2199.
- Targets and monthly intentions are not funded balances, scheduled debits, guaranteed returns, goal allocations or investment positions. These writes never create a ledger journal, hold or trade.
- Owner-scoped bounded reads (latest 100 active/archived combined). Dashboard metrics explicitly sum only loaded active plans. No claim of a complete all-time total when records exceed the cap.
- Confirmed savings/progress remains unavailable until real allocation/contribution tracking exists. No fabricated funded percentage, on-track classification, future value or yield.
- Goal ID retained through create retries. An unchanged original creation can be replayed; changed details or a later-modified goal conflict. Update/archive/restore require the current owner-scoped revision. Stale operations do not overwrite newer records.
- Append-only goal event metadata committed in the same SQL statement as the change. Archived goals retain their targets; no destructive delete endpoint.
- Authenticated sessions, origin checks, JSON/body validation and rate limits. Goal planning is nonfinancial and does not require password/MFA step-up; existing account session rules still apply.
- Light/dark responsive UI, balance-privacy masking of target/monthly totals and per-goal amounts, refresh/error/empty states, conflict draft retention, draft discard prompts for goal controls and guarded dashboard navigation. Browser unload warns about an open draft. Drafts are not persisted in local storage. Unguarded SPA links/global browser navigation still need comprehensive route-blocker testing.

## Remaining

Real contributions and fund allocations, progress history, multiple currencies, projections with explicit assumptions, reminders, goal-event UI/export, full pagination/search and comprehensive draft navigation protection. No money/goal allocation or recurring execution is enabled. Goal targets are currently USD-only planning values independent of what assets the customer holds.

The old simulated Goals controls remain disconnected. The restored income/auto-invest/insights layouts are unaffected. The Overview "Goals on track" metric stays unavailable because creating plans alone does not establish funding or on-track status.

## Validation and rollout

Six local PGlite/API tests cover owner/session/origin boundaries, exact large amounts, invalid names/dates/amounts, client saved-balance/owner claim rejection, safe create replay, stale updates, archive/restore, immutable events and no ledger/hold mutations. Browser HTTP mocks cover create/edit/reload/conflict draft retention/archive/restore/errors and light/dark 320–1440px layout. These are not hosted concurrency or external financial service tests.

Back up and review the database, apply the numbered migrations atomically (`npm run db:migrate`) before deploying. No new environment secrets or financial feature flags are required for goal planning. Earlier withdrawal/admin release gates remain unchanged.
